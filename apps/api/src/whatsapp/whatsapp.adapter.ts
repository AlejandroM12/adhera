import { Injectable, Logger } from '@nestjs/common';
import { ChannelContact, DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config/env';
import { ChannelAdapter, InboundMessage, OutboundMessage } from '../channels/channel-adapter';
import { SessionsService } from '../sessions/sessions.service';
import { WhatsAppGraphClient } from './graph.client';
import { GraphMessage, NormalizedInbound, questionMessage, readReceipt, textMessage } from './payloads';

/** Ventana de atención de Meta: sólo se responde con mensajes libres dentro de las 24 h. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const STATUS_RANK: Record<DeliveryStatus, number> = { PENDING: 0, SKIPPED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

/**
 * Canal WhatsApp Cloud API. Transporta mensajes: el motor conversacional decide qué preguntar.
 * Registra cada envío (sin contenido) para seguir su estado y reintentos.
 */
@Injectable()
export class WhatsAppCloudAdapter implements ChannelAdapter {
  readonly channel = 'WHATSAPP';
  private readonly logger = new Logger('WhatsApp');
  private client: WhatsAppGraphClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  /** Permite inyectar un cliente en pruebas. */
  setClient(client: WhatsAppGraphClient) {
    this.client = client;
  }

  private get graph(): WhatsAppGraphClient {
    if (!this.client) {
      const cfg = config();
      this.client = new WhatsAppGraphClient({
        baseUrl: cfg.WHATSAPP_GRAPH_BASE_URL,
        version: cfg.WHATSAPP_GRAPH_VERSION,
        phoneNumberId: cfg.WHATSAPP_PHONE_NUMBER_ID ?? '',
        accessToken: cfg.WHATSAPP_ACCESS_TOKEN ?? '',
      });
    }
    return this.client;
  }

  normalizeInbound(sessionId: string, raw: unknown): InboundMessage {
    const { message, questionKey, value } = raw as { message: NormalizedInbound; questionKey: string; value: unknown };
    // El wamid es la clave de idempotencia: un reintento de Meta no duplica la respuesta.
    return { sessionId, questionKey, value, requestId: message.id };
  }

  async receiveMessage(message: InboundMessage): Promise<void> {
    await this.sessions.answer(message);
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    const session = await this.prisma.conversationSession.findUnique({ where: { id: message.sessionId }, include: { contact: true } });
    if (!session?.contact) return;
    const to = session.contact.externalUserId;
    const payload =
      message.kind === 'question' && message.question
        ? questionMessage(to, message.question, message.progress)
        : textMessage(to, message.text ?? '');
    await this.sendToContact(session.contact, payload, message.kind, session.id);
  }

  /** Marca el mensaje como leído (mejor esfuerzo; no se registra ni reintenta). */
  async acknowledge(requestId: string): Promise<void> {
    await this.graph.send(readReceipt(requestId)).catch(() => undefined);
  }

  /** Envía un mensaje respetando baja voluntaria y ventana de 24 h. */
  async sendToContact(contact: ChannelContact, payload: GraphMessage, kind: string, sessionId?: string | null) {
    const outsideWindow = !contact.lastInboundAt || Date.now() - contact.lastInboundAt.getTime() > SERVICE_WINDOW_MS;
    const optedOut = Boolean(contact.optedOutAt) && kind !== 'opted_out';
    if (outsideWindow || optedOut) {
      await this.prisma.messageDelivery.create({
        data: { contactId: contact.id, sessionId: sessionId ?? null, kind, status: DeliveryStatus.SKIPPED, errorCode: optedOut ? 'opted_out' : 'outside_window' },
      });
      return { ok: false as const };
    }
    const delivery = await this.prisma.messageDelivery.create({
      data: { contactId: contact.id, sessionId: sessionId ?? null, kind, status: DeliveryStatus.PENDING },
    });
    const result = await this.graph.send(payload);
    if (result.ok) {
      await this.prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.SENT, externalId: result.messageId, attempts: result.attempts },
      });
    } else {
      // Sólo códigos e ids internos en los registros: nunca teléfonos ni textos.
      this.logger.warn(`Envío "${kind}" falló tras ${result.attempts} intento(s): código ${result.errorCode} (entrega ${delivery.id})`);
      await this.prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: { status: DeliveryStatus.FAILED, errorCode: result.errorCode, attempts: result.attempts },
      });
    }
    return result;
  }

  /** Aplica un evento de estado (sent/delivered/read/failed) sin retroceder estados. */
  async applyStatus(externalId: string, status: 'sent' | 'delivered' | 'read' | 'failed', errorCode?: string) {
    const delivery = await this.prisma.messageDelivery.findUnique({ where: { externalId } });
    if (!delivery) return false;
    const next = status.toUpperCase() as DeliveryStatus;
    if (STATUS_RANK[next] <= STATUS_RANK[delivery.status]) return false;
    await this.prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: { status: next, ...(errorCode ? { errorCode } : {}) },
    });
    if (next === DeliveryStatus.FAILED) this.logger.warn(`Meta informó falla de entrega ${delivery.id}: código ${errorCode ?? '?'}`);
    return true;
  }
}
