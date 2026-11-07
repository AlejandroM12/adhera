import { ConflictException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ActorType, Channel, ChannelContact, Prisma, SessionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { KeyedMutex, RateLimiter } from '../common/rate-limiter';
import { config } from '../config/env';
import { ActivityService } from '../activity/activity.service';
import { SessionsService } from '../sessions/sessions.service';
import { WhatsAppCloudAdapter } from './whatsapp.adapter';
import { CONSENT_NO, CONSENT_YES, MSG } from './messages';
import {
  buttonsMessage, confirmationMessage, extractEvents, NormalizedInbound, parseCommand, questionMessage, resolveAnswer,
  resolveConfirmation, textMessage,
} from './payloads';

type State = Awaited<ReturnType<SessionsService['buildState']>>;

const HANDOFF_REMINDER_MS = 6 * 60 * 60 * 1000;

export interface WebhookResult {
  messages: number;
  processed: number;
  duplicates: number;
  ignored: number;
  statuses: number;
}

/**
 * Orquesta la conversación por WhatsApp sobre el mismo motor del simulador.
 * El bot sólo hace las preguntas configuradas: no responde consultas ni decide afiliaciones.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger('WhatsApp');
  private readonly mutex = new KeyedMutex();
  /** Anti-abuso: máximo de mensajes procesados por contacto (el resto se ignora sin responder). */
  private readonly perContact = new RateLimiter(20, 60_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly activity: ActivityService,
    private readonly adapter: WhatsAppCloudAdapter,
  ) {}

  async handleWebhook(body: unknown): Promise<WebhookResult> {
    const ownNumber = config().WHATSAPP_PHONE_NUMBER_ID;
    const events = extractEvents(body);
    const result: WebhookResult = { messages: events.messages.length, processed: 0, duplicates: 0, ignored: 0, statuses: 0 };

    for (const status of events.statuses) {
      if (status.phoneNumberId !== ownNumber) continue;
      if (await this.adapter.applyStatus(status.id, status.status, status.errorCode)) result.statuses++;
    }
    for (const message of events.messages) {
      // Sólo se procesan mensajes dirigidos al número configurado.
      if (message.phoneNumberId !== ownNumber) {
        result.ignored++;
        continue;
      }
      const key = `${message.phoneNumberId}:${message.from}`;
      const outcome = await this.mutex.run(key, () => this.handleInbound(message));
      if (outcome === 'duplicate') result.duplicates++;
      else if (outcome === 'processed') result.processed++;
      else result.ignored++;
    }
    this.logger.log(
      `Webhook: ${result.messages} mensaje(s), ${result.processed} procesado(s), ${result.duplicates} duplicado(s), ${result.ignored} ignorado(s), ${result.statuses} estado(s)`,
    );
    return result;
  }

  private async handleInbound(m: NormalizedInbound): Promise<'processed' | 'duplicate' | 'ignored'> {
    const previous = await this.prisma.inboundMessage.findUnique({ where: { id: m.id } });
    if (previous?.processedAt) return 'duplicate';

    const now = new Date();
    const contact = await this.prisma.channelContact.upsert({
      where: {
        channel_externalUserId_externalChannelId: { channel: Channel.WHATSAPP, externalUserId: m.from, externalChannelId: m.phoneNumberId },
      },
      update: { lastInboundAt: now },
      create: { channel: Channel.WHATSAPP, externalUserId: m.from, externalChannelId: m.phoneNumberId, lastInboundAt: now },
    });
    if (!previous) {
      try {
        await this.prisma.inboundMessage.create({ data: { id: m.id, contactId: contact.id, type: m.type } });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    const markProcessed = () => this.prisma.inboundMessage.update({ where: { id: m.id }, data: { processedAt: new Date() } });

    if (!this.perContact.allow(contact.id)) {
      this.logger.warn(`Contacto ${contact.id} superó el límite de mensajes; se ignora el mensaje`);
      await markProcessed();
      return 'ignored';
    }

    await this.adapter.acknowledge(m.id);
    await this.converse(contact, m);
    await markProcessed();
    return 'processed';
  }

  private send(contact: ChannelContact, body: string, kind: string, sessionId?: string) {
    return this.adapter.sendToContact(contact, textMessage(contact.externalUserId, body), kind, sessionId);
  }

  private async sendQuestion(contact: ChannelContact, state: State) {
    if (state.pendingConfirmation) {
      await this.adapter.sendToContact(
        contact, confirmationMessage(contact.externalUserId, state.pendingConfirmation), 'confirmation', state.sessionId,
      );
      return;
    }
    if (!state.nextQuestion) return;
    await this.adapter.sendToContact(
      contact,
      questionMessage(contact.externalUserId, state.nextQuestion, state.progress),
      'question',
      state.sessionId,
    );
  }

  private async startConversation(contact: ChannelContact, intro: string) {
    const state = await this.sessions.start({ channel: Channel.WHATSAPP, contactId: contact.id });
    await this.send(contact, intro, 'intro', state.sessionId);
    await this.sendQuestion(contact, state);
  }

  private async converse(contact: ChannelContact, m: NormalizedInbound) {
    const parsed = m.kind === 'text' ? parseCommand(m.text) : null;
    // ALTA después de una baja equivale a retomar: nunca se guarda como respuesta.
    const command = parsed === 'start' ? 'continue' : parsed;

    // Baja voluntaria: se confirma una vez y no se envía nada más.
    if (command === 'stop') {
      const updated = await this.prisma.channelContact.update({ where: { id: contact.id }, data: { optedOutAt: new Date() } });
      await this.send(updated, MSG.optedOut, 'opted_out');
      return;
    }
    if (contact.optedOutAt) {
      if (parsed !== 'start') return;
      contact = await this.prisma.channelContact.update({ where: { id: contact.id }, data: { optedOutAt: null } });
    }

    // Consentimiento antes de guardar cualquier respuesta.
    if (!contact.consentAt) {
      if (m.replyId === CONSENT_YES) {
        contact = await this.prisma.channelContact.update({ where: { id: contact.id }, data: { consentAt: new Date() } });
        await this.startConversation(contact, MSG.intro);
      } else if (m.replyId === CONSENT_NO) {
        await this.send(contact, MSG.consentDeclined, 'consent_declined');
      } else {
        await this.adapter.sendToContact(
          contact,
          buttonsMessage(contact.externalUserId, MSG.welcome, [
            { id: CONSENT_YES, title: 'Acepto' },
            { id: CONSENT_NO, title: 'No acepto' },
          ]),
          'consent',
        );
      }
      return;
    }

    const session = await this.sessions.findActiveForContact(contact.id);

    if (command === 'help') {
      await this.send(contact, MSG.help, 'help', session?.id);
      if (session) await this.sendQuestion(contact, await this.sessions.buildState(session.id));
      return;
    }
    if (command === 'restart') {
      contact = await this.prisma.channelContact.update({ where: { id: contact.id }, data: { botPausedAt: null, invalidStreak: 0 } });
      await this.startConversation(contact, MSG.restarted);
      return;
    }
    if (command === 'handoff') {
      const target = session ?? (await this.sessions.lastForContact(contact.id));
      if (target) await this.requestHandoff(target.applicationId);
      await this.prisma.channelContact.update({ where: { id: contact.id }, data: { botPausedAt: new Date(), lastHandoffNoticeAt: new Date() } });
      await this.send(contact, MSG.handoff, 'handoff', target?.id);
      return;
    }

    // Derivación activa: el bot no sigue preguntando salvo que el interesado lo pida.
    if (contact.botPausedAt) {
      if (command === 'continue') {
        contact = await this.prisma.channelContact.update({ where: { id: contact.id }, data: { botPausedAt: null } });
      } else {
        const last = contact.lastHandoffNoticeAt?.getTime() ?? 0;
        if (Date.now() - last > HANDOFF_REMINDER_MS) {
          await this.prisma.channelContact.update({ where: { id: contact.id }, data: { lastHandoffNoticeAt: new Date() } });
          await this.send(contact, MSG.handoffReminder, 'handoff_reminder', session?.id);
        }
        return;
      }
    }

    if (!session) {
      const last = await this.sessions.lastForContact(contact.id);
      if (last?.status === SessionStatus.COMPLETED) {
        await this.send(contact, MSG.alreadyCompleted, 'already_completed', last.id);
        return;
      }
      await this.startConversation(contact, MSG.intro);
      return;
    }

    const state = await this.sessions.buildState(session.id);
    const question = state.nextQuestion;
    if (!question) {
      await this.finish(contact, session.id);
      return;
    }
    // Retomar: CONTINUAR o un mensaje no soportado reenvían la pregunta pendiente.
    if (command === 'continue') {
      await this.sendQuestion(contact, state);
      return;
    }
    if (m.kind === 'unsupported') {
      await this.send(contact, MSG.unsupported, 'unsupported', session.id);
      await this.sendQuestion(contact, state);
      return;
    }

    // Respuesta ambigua pendiente: el interesado elige una opción numerada.
    if (state.pendingConfirmation) {
      const choice = resolveConfirmation(state.pendingConfirmation.options, { replyId: m.replyId, text: m.text });
      if (choice === null) {
        await this.sendQuestion(contact, state);
        return;
      }
      await this.adapter.receiveMessage(
        this.adapter.normalizeInbound(session.id, { message: m, questionKey: state.pendingConfirmation.key, value: null, confirm: choice }),
      );
      const after = await this.sessions.buildState(session.id);
      if (after.canComplete) await this.finish(contact, session.id);
      else await this.sendQuestion(contact, after);
      return;
    }

    let value: unknown;
    if (command === 'skip') {
      if (question.required) {
        await this.send(contact, MSG.cannotSkip, 'validation_error', session.id);
        await this.sendQuestion(contact, state);
        return;
      }
      value = null;
    } else {
      value = resolveAnswer(question, { replyId: m.replyId, text: m.text });
    }

    try {
      await this.adapter.receiveMessage(
        this.adapter.normalizeInbound(session.id, { message: m, questionKey: question.key, value }),
      );
    } catch (e) {
      if (e instanceof UnprocessableEntityException) {
        const updated = await this.prisma.channelContact.update({
          where: { id: contact.id },
          data: { invalidStreak: { increment: 1 } },
        });
        const reason = (e.getResponse() as { message?: string }).message ?? 'No pude entender la respuesta.';
        await this.send(updated, `${reason}${updated.invalidStreak >= 2 ? MSG.invalidSuffix : ''}`, 'validation_error', session.id);
        await this.sendQuestion(updated, state);
        return;
      }
      if (e instanceof ConflictException) {
        await this.sendQuestion(contact, await this.sessions.buildState(session.id));
        return;
      }
      throw e;
    }

    if (contact.invalidStreak > 0) {
      contact = await this.prisma.channelContact.update({ where: { id: contact.id }, data: { invalidStreak: 0 } });
    }
    const next = await this.sessions.buildState(session.id);
    if (next.canComplete && !next.pendingConfirmation) await this.finish(contact, session.id);
    else await this.sendQuestion(contact, next);
  }

  private async finish(contact: ChannelContact, sessionId: string) {
    await this.sessions.complete(sessionId);
    await this.send(contact, MSG.completed, 'completed', sessionId);
  }

  /** Marca la solicitud para que la atienda una persona. No decide nada sobre la afiliación. */
  private async requestHandoff(applicationId: string) {
    const app = await this.prisma.application.findUnique({ where: { id: applicationId } });
    if (!app || app.handoffRequestedAt) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.application.update({ where: { id: applicationId }, data: { handoffRequestedAt: new Date() } });
      await this.activity.log(applicationId, 'HANDOFF_REQUESTED', { type: ActorType.APPLICANT }, { channel: Channel.WHATSAPP }, tx);
    });
  }
}
