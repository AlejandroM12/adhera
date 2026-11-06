import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ActorType, ApplicationStatus, Channel, Prisma, SessionStatus } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { QuestionnairesService } from '../questionnaires/questionnaires.service';
import { toPublicQuestion } from '../questionnaires/question-mapper';
import { InboundMessage } from '../channels/channel-adapter';
import {
  AnswerMap,
  AnswerValue,
  canComplete,
  computeProgress,
  EngineQuestion,
  formatAnswer,
  nextQuestion,
  validateAnswer,
  visibleQuestions,
} from '../engine/conversation-engine';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const APPLICANT = { type: ActorType.APPLICANT };

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

  private async loadAnswers(sessionId: string, questions: EngineQuestion[]): Promise<AnswerMap> {
    const answers = await this.prisma.answer.findMany({ where: { sessionId } });
    const byId = new Map(questions.map((q) => [q.id, q.key]));
    const map: AnswerMap = {};
    for (const a of answers) {
      const key = byId.get(a.questionId);
      if (key) map[key] = (a.valueJson ?? null) as AnswerValue;
    }
    return map;
  }

  async buildState(sessionId: string) {
    const session = await this.prisma.conversationSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { version: { include: { questionnaire: true } } },
    });
    const questions = await this.questionnaires.getVersionQuestions(session.versionId);
    const answers = await this.loadAnswers(sessionId, questions);
    const next = session.status === SessionStatus.COMPLETED ? null : nextQuestion(questions, answers);
    return {
      sessionId: session.id,
      status: session.status,
      questionnaire: { name: session.version.questionnaire.name, version: session.version.version },
      progress: computeProgress(questions, answers),
      nextQuestion: next ? toPublicQuestion(next) : null,
      canComplete: session.status === SessionStatus.IN_PROGRESS && canComplete(questions, answers),
      transcript: visibleQuestions(questions, answers)
        .filter((q) => q.key in answers)
        .map((q) => ({ key: q.key, label: q.label, answer: formatAnswer(q, answers[q.key]) })),
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };
  }

  async answer(msg: InboundMessage) {
    const session = await this.prisma.conversationSession.findUniqueOrThrow({ where: { id: msg.sessionId } });

    // Reintento idempotente: mismo requestId => devolver el estado actual.
    const previous = await this.prisma.answer.findUnique({ where: { requestId: msg.requestId } });
    if (previous) {
      if (previous.sessionId !== session.id) throw new ConflictException('requestId ya utilizado.');
      return this.buildState(session.id);
    }
    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new ConflictException('La conversación ya fue finalizada.');
    }

    const questions = await this.questionnaires.getVersionQuestions(session.versionId);
    const answers = await this.loadAnswers(session.id, questions);
    const current = nextQuestion(questions, answers);
    if (!current) throw new ConflictException('No quedan preguntas por responder.');
    if (current.key !== msg.questionKey) {
      if (msg.questionKey in answers) return this.buildState(session.id);
      throw new ConflictException(`La pregunta actual es "${current.key}".`);
    }

    const result = validateAnswer(current, msg.value);
    if (!result.ok) throw new UnprocessableEntityException({ message: result.error, questionKey: current.key });

    const after = { ...answers, [current.key]: result.value };
    const following = nextQuestion(questions, after);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.answer.create({
          data: {
            sessionId: session.id,
            questionId: current.id,
            valueJson: result.value === null ? Prisma.DbNull : result.value,
            rawText: msg.value === null ? null : String(msg.value).slice(0, 2000),
            requestId: msg.requestId,
          },
        });
        await tx.conversationSession.update({
          where: { id: session.id },
          data: { currentQuestionKey: following?.key ?? null },
        });
        if (current.key === 'full_name' && typeof result.value === 'string') {
          await tx.application.update({ where: { id: session.applicationId }, data: { displayName: result.value } });
        } else {
          await tx.application.update({ where: { id: session.applicationId }, data: { updatedAt: new Date() } });
        }
        // Sólo se registra la clave, no el contenido de la respuesta.
        await this.activity.log(session.applicationId, 'ANSWER_RECORDED', APPLICANT, { questionKey: current.key }, tx);
      });
    } catch (e) {
      // Respuesta concurrente para la misma pregunta: la primera gana.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.buildState(session.id);
      throw e;
    }
    return this.buildState(session.id);
  }

  async complete(sessionId: string) {
    const session = await this.prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (session.status === SessionStatus.COMPLETED) return this.buildState(sessionId);
    const questions = await this.questionnaires.getVersionQuestions(session.versionId);
    const answers = await this.loadAnswers(sessionId, questions);
    if (!canComplete(questions, answers)) {
      throw new BadRequestException('Todavía quedan preguntas obligatorias sin responder.');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.conversationSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.COMPLETED, completedAt: now, currentQuestionKey: null },
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
