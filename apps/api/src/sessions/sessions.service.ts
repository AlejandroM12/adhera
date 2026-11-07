import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ActorType, ApplicationStatus, Channel, ConversationSession, Prisma, SessionStatus } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { QuestionnairesService } from '../questionnaires/questionnaires.service';
import { toAnswerMap, toPublicStep } from '../questionnaires/question-mapper';
import { InboundMessage } from '../channels/channel-adapter';
import { localityById, provinceById, resolveLocality } from '../catalog/localities';
import { HEALTH_V2_CONSENT_VERSION, HEALTH_V2_KEY } from '../questionnaires/templates/health-v2';
import {
  AnswerMap,
  AnswerValue,
  computeProgress,
  Confirmation,
  EngineQuestion,
  expandSteps,
  formatAnswer,
  Step,
  validateAnswer,
  ValidationContext,
} from '../engine/conversation-engine';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const APPLICANT = { type: ActorType.APPLICANT };

/** Respuesta ambigua esperando que el interesado elija una opción. */
interface Pending extends Confirmation {
  stepId: string;
  rawText: string | null;
  correction: boolean;
}

const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));
const rawTextOf = (value: unknown) =>
  value === null || value === undefined ? null : (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, 2000);

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionnaires: QuestionnairesService,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Inicia una conversación con la versión activa del cuestionario. El simulador recibe un
   * token para retomar; los canales externos se identifican por su contacto.
   */
  async start(opts: { channel?: Channel; contactId?: string } = {}) {
    const channel = opts.channel ?? Channel.SIMULATOR;
    const version = await this.questionnaires.getActiveVersion();
    const resumeToken = randomBytes(24).toString('base64url');
    const first = version.questions[0];
    const session = await this.prisma.$transaction(async (tx) => {
      const app = await tx.application.create({ data: { displayName: 'Interesado sin nombre', channel } });
      const s = await tx.conversationSession.create({
        data: {
          applicationId: app.id,
          versionId: version.id,
          channel,
          contactId: opts.contactId ?? null,
          resumeTokenHash: hashToken(resumeToken),
          currentQuestionKey: first?.key ?? null,
        },
      });
      await this.activity.log(app.id, 'SESSION_STARTED', APPLICANT, { version: version.version, channel }, tx);
      return s;
    });
    return { ...(await this.buildState(session.id)), resumeToken };
  }

  /** Conversación en curso de un contacto externo (la más reciente). */
  findActiveForContact(contactId: string) {
    return this.prisma.conversationSession.findFirst({
      where: { contactId, status: SessionStatus.IN_PROGRESS },
      orderBy: { startedAt: 'desc' },
      include: { application: { select: { id: true, handoffRequestedAt: true } } },
    });
  }

  lastForContact(contactId: string) {
    return this.prisma.conversationSession.findFirst({ where: { contactId }, orderBy: { startedAt: 'desc' } });
  }

  /** Verifica que el token corresponda a esta sesión (y sólo a esta). */
  async authorize(sessionId: string, token: string | undefined) {
    if (!token) throw new ForbiddenException('Falta el token de sesión.');
    const session = await this.prisma.conversationSession.findUnique({ where: { id: sessionId } });
    const expected = session ? Buffer.from(session.resumeTokenHash) : Buffer.alloc(64);
    const given = Buffer.from(hashToken(token));
    if (!session || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new ForbiddenException('Token inválido para esta sesión.');
    }
    return session;
  }

  private async load(sessionId: string) {
    const session = await this.prisma.conversationSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { version: { include: { questionnaire: true } } },
    });
    const questions = await this.questionnaires.getVersionQuestions(session.versionId);
    const rows = await this.prisma.answer.findMany({ where: { sessionId } });
    const answers = toAnswerMap(questions, rows);
    return { session, questions, rows, answers };
  }

  /** Contexto de validación: fecha, provincia elegida y catálogo de localidades. */
  private validationContext(question: EngineQuestion, answers: AnswerMap): ValidationContext {
    const provinceKey = question.meta?.provinceKey;
    const provinceId = provinceKey && typeof answers[provinceKey] === 'string' ? (answers[provinceKey] as string) : undefined;
    return {
      today: new Date(),
      provinceId,
      provinceName: provinceId ? provinceById(provinceId)?.name : undefined,
      resolveLocality,
      localityById,
    };
  }

  private publicStep(step: Step, answers: AnswerMap) {
    return toPublicStep(step, { provinceId: this.validationContext(step.question, answers).provinceId });
  }

  async buildState(sessionId: string) {
    const { session, questions, answers } = await this.load(sessionId);
    const completed = session.status === SessionStatus.COMPLETED;
    const steps = expandSteps(questions, answers);
    const next = completed ? null : (steps.find((s) => !(s.id in answers)) ?? null);
    const pending = completed ? null : ((session.pendingJson as Pending | null) ?? null);
    const reviewConfirmed = steps.some((s) => s.question.meta?.role === 'review' && answers[s.id] === true);
    const v = session.version;
    return {
      sessionId: session.id,
      status: session.status,
      questionnaire: { name: v.questionnaire.name, version: v.version, title: v.title ?? null },
      progress: computeProgress(questions, answers),
      nextQuestion: next ? this.publicStep(next, answers) : null,
      pendingConfirmation: pending
        ? { key: pending.stepId, message: pending.message, options: pending.candidates.map((c) => c.label), correction: pending.correction }
        : null,
      canComplete: !completed && next === null,
      /** Se pueden corregir respuestas hasta confirmar la revisión final. */
      canCorrect: !completed && !reviewConfirmed,
      transcript: steps
        .filter((s) => s.id in answers)
        .map((s) => ({
          key: s.id,
          label: s.label,
          answer: formatAnswer(s.question, answers[s.id]),
          ...(s.question.meta?.section ? { section: s.question.meta.section } : {}),
          ...(s.member ? { member: { id: s.member.id, name: s.member.name, titular: s.member.titular } } : {}),
          editable: s.question.meta?.role !== 'review' && s.question.meta?.role !== 'consent',
          question: this.publicStep(s, answers),
        })),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };
  }

  /**
   * Registra una respuesta (o su confirmación / corrección). Reglas:
   * - sólo se responde el paso actual, salvo correcciones antes de confirmar la revisión;
   * - una respuesta ambigua queda pendiente hasta que el interesado elige una opción;
   * - una corrección conserva el valor anterior en el historial (AnswerRevision).
   */
  async answer(msg: InboundMessage) {
    const previous = await this.prisma.answer.findUnique({ where: { requestId: msg.requestId } });
    if (previous) {
      // Reintento idempotente: mismo requestId => devolver el estado actual.
      const owner = await this.prisma.conversationSession.findUnique({ where: { id: msg.sessionId }, select: { id: true } });
      if (previous.sessionId !== owner?.id) throw new ConflictException('requestId ya utilizado.');
      return this.buildState(msg.sessionId);
    }
    const { session, questions, rows, answers } = await this.load(msg.sessionId);
    if (session.status !== SessionStatus.IN_PROGRESS) throw new ConflictException('La conversación ya fue finalizada.');

    const steps = expandSteps(questions, answers);
    const current = steps.find((s) => !(s.id in answers)) ?? null;
    const pending = (session.pendingJson as Pending | null) ?? null;

    // 1) Respuesta a una confirmación pendiente.
    if (msg.confirm !== undefined) {
      if (!pending || pending.stepId !== msg.questionKey) {
        if (msg.questionKey in answers) return this.buildState(session.id);
        throw new ConflictException('No hay ninguna respuesta para confirmar.');
      }
      const step = steps.find((s) => s.id === pending.stepId);
      if (!step) throw new ConflictException('La pregunta ya no corresponde.');
      if (msg.confirm === 'reject') {
        await this.prisma.conversationSession.update({ where: { id: session.id }, data: { pendingJson: Prisma.DbNull } });
        return this.buildState(session.id);
      }
      const chosen = pending.candidates[msg.confirm];
      if (!chosen) throw new UnprocessableEntityException({ message: 'Elegí una de las opciones.', questionKey: step.id });
      const confirmation = { message: pending.message, offered: pending.candidates.map((c) => c.label), chosen: msg.confirm, at: new Date() };
      return this.store(session, questions, rows, answers, step, chosen.value, pending.rawText, confirmation, msg.requestId, pending.correction);
    }

    // 2) Respuesta nueva o corrección.
    let step: Step | undefined;
    if (msg.correction) {
      step = steps.find((s) => s.id === msg.questionKey && s.id in answers);
      if (!step) throw new ConflictException('Esa respuesta no se puede corregir.');
      const role = step.question.meta?.role;
      if (role === 'review' || role === 'consent') throw new ConflictException('Esa respuesta no se puede corregir.');
      if (steps.some((s) => s.question.meta?.role === 'review' && answers[s.id] === true)) {
        throw new ConflictException('Ya confirmaste la revisión: las respuestas no se pueden corregir.');
      }
    } else {
      if (!current) throw new ConflictException('No quedan preguntas por responder.');
      if (current.id !== msg.questionKey) {
        if (msg.questionKey in answers) return this.buildState(session.id);
        throw new ConflictException(`La pregunta actual es "${current.id}".`);
      }
      step = current;
    }

    const result = validateAnswer(step.question, msg.value, this.validationContext(step.question, answers));
    if (result.ok === false) throw new UnprocessableEntityException({ message: result.error, questionKey: step.id });
    if (result.ok === 'confirm') {
      const next: Pending = {
        stepId: step.id,
        rawText: rawTextOf(msg.value),
        correction: Boolean(msg.correction),
        message: result.message,
        candidates: result.candidates,
      };
      await this.prisma.conversationSession.update({ where: { id: session.id }, data: { pendingJson: next as unknown as Prisma.InputJsonValue } });
      return this.buildState(session.id);
    }
    return this.store(session, questions, rows, answers, step, result.value, rawTextOf(msg.value), null, msg.requestId, Boolean(msg.correction));
  }

  private async store(
    session: ConversationSession,
    questions: EngineQuestion[],
    rows: { id: string; questionId: string; instance: string; valueJson: unknown; rawText: string | null; confirmationJson: unknown; requestId: string | null }[],
    answers: AnswerMap,
    step: Step,
    value: AnswerValue,
    rawText: string | null,
    confirmation: object | null,
    requestId: string,
    correction: boolean,
  ) {
    const after: AnswerMap = { ...answers, [step.id]: value };
    const following = expandSteps(questions, after).find((s) => !(s.id in after)) ?? null;
    const existing = rows.find((r) => r.questionId === step.question.id && r.instance === step.instance);
    const role = step.question.meta?.role;
    try {
      await this.prisma.$transaction(async (tx) => {
        if (correction && existing) {
          await tx.answerRevision.create({
            data: {
              answerId: existing.id,
              previousValueJson: json(existing.valueJson),
              previousRawText: existing.rawText,
              previousConfirmationJson: json(existing.confirmationJson),
              previousRequestId: existing.requestId,
              newValueJson: json(value),
              newRawText: rawText,
            },
          });
          await tx.answer.update({
            where: { id: existing.id },
            data: { valueJson: json(value), rawText, confirmationJson: json(confirmation), requestId },
          });
        } else {
          await tx.answer.create({
            data: {
              sessionId: session.id,
              questionId: step.question.id,
              instance: step.instance,
              valueJson: json(value),
              rawText,
              confirmationJson: json(confirmation),
              requestId,
            },
          });
        }
        await tx.conversationSession.update({
          where: { id: session.id },
          data: { currentQuestionKey: following?.id ?? null, pendingJson: Prisma.DbNull },
        });
        const displayName = this.displayNameFrom(questions, after, step);
        await tx.application.update({
          where: { id: session.applicationId },
          data: displayName ? { displayName } : { updatedAt: new Date() },
        });
        // Sólo se registra la clave del paso, nunca el contenido de la respuesta.
        await this.activity.log(
          session.applicationId,
          correction ? 'ANSWER_CORRECTED' : 'ANSWER_RECORDED',
          APPLICANT,
          { questionKey: step.id },
          tx,
        );
        if (role === 'review' && value === true) {
          await tx.conversationSession.update({ where: { id: session.id }, data: { reviewConfirmedAt: new Date() } });
        }
      });
    } catch (e) {
      // Respuesta concurrente para el mismo paso: la primera gana.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.buildState(session.id);
      throw e;
    }
    return this.buildState(session.id);
  }

  /** Nombre visible de la solicitud: v1 `full_name`; v2 nombre y apellido de la persona titular. */
  private displayNameFrom(questions: EngineQuestion[], answers: AnswerMap, step: Step): string | null {
    if (step.question.key === 'full_name' && typeof answers.full_name === 'string') return answers.full_name;
    const role = step.question.meta?.role;
    if (role !== 'titular_first_name' && role !== 'titular_last_name') return null;
    const first = questions.find((q) => q.meta?.role === 'titular_first_name');
    const last = questions.find((q) => q.meta?.role === 'titular_last_name');
    const parts = [first && answers[first.key], last && answers[last.key]].filter((x): x is string => typeof x === 'string');
    return parts.length ? parts.join(' ') : null;
  }

  async complete(sessionId: string) {
    const { session, questions, answers } = await this.load(sessionId);
    if (session.status === SessionStatus.COMPLETED) return this.buildState(sessionId);
    const steps = expandSteps(questions, answers);
    if (steps.some((s) => !(s.id in answers))) {
      throw new BadRequestException('Todavía quedan preguntas obligatorias sin responder.');
    }
    const consented = steps.some((s) => s.question.meta?.role === 'consent' && answers[s.id] === true);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.conversationSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.COMPLETED,
          completedAt: now,
          currentQuestionKey: null,
          pendingJson: Prisma.DbNull,
          ...(consented
            ? { consentAt: now, consentVersion: session.version.templateKey === HEALTH_V2_KEY ? HEALTH_V2_CONSENT_VERSION : session.version.templateKey }
            : {}),
        },
      });
      await tx.application.update({
        where: { id: session.applicationId },
        data: { status: ApplicationStatus.PENDING_REVIEW, completedAt: now },
      });
      await this.activity.log(session.applicationId, 'SESSION_COMPLETED', APPLICANT, undefined, tx);
      await this.activity.log(
        session.applicationId,
        'STATUS_CHANGED',
        { type: ActorType.SYSTEM },
        { from: ApplicationStatus.IN_PROGRESS, to: ApplicationStatus.PENDING_REVIEW },
        tx,
      );
    });
    return this.buildState(sessionId);
  }

  async ensureExists(sessionId: string) {
    const s = await this.prisma.conversationSession.findUnique({ where: { id: sessionId }, select: { id: true } });
    if (!s) throw new NotFoundException('Sesión inexistente.');
  }
}
