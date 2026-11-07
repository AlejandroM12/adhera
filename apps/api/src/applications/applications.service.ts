import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, ApplicationStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { AdvisorPrincipal } from '../auth/auth.service';
import { toAnswerMap, toEngineQuestion } from '../questionnaires/question-mapper';
import {
  AnswerMap, AnswerValue, buildProfile, buildSummary, formatAnswer, ProfileField, stepId,
} from '../engine/conversation-engine';
import { abandonCutoff, lastApplicantActivity, Segment, segmentOf, segmentWhere } from './segments';
import { buildDossier, Dossier, ObservationNote } from './dossier';

export const ListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.nativeEnum(ApplicationStatus).optional(),
  assignedUserId: z.string().max(40).optional(),
  // submitted = enviadas o en gestión; in_progress = conversación activa; abandoned = sin actividad.
  view: z.enum(['all', 'submitted', 'in_progress', 'abandoned']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const NoteSchema = z.object({
  content: z.string().trim().min(1, 'La nota no puede estar vacía.').max(2000),
  /** Paso al que se refiere (`clave` o `clave#integrante`). */
  questionKey: z.string().trim().max(80).optional(),
  kind: z.enum(['NOTE', 'OBSERVATION', 'CLARIFICATION']).optional(),
});

export const UpdateSchema = z
  .object({
    status: z.nativeEnum(ApplicationStatus).optional(),
    assignedUserId: z.string().max(40).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.assignedUserId !== undefined, 'Nada para actualizar.');

const advisorActor = (a: AdvisorPrincipal) => ({ type: ActorType.ADVISOR, id: a.id });

/** Datos que no se muestran como "datos clave" en listados (nombre e identificación personal). */
const NAME_KEYS = new Set(['full_name', 'first_name', 'last_name']);
const HIGHLIGHT_TYPES = new Set(['single_choice', 'number', 'text', 'locality']);
/** Preentrevista v2: tipo de plan, localidad e integrantes adicionales. */
const V2_HIGHLIGHTS = ['plan_type', 'locality', 'members_count'];

/** "1 integrantes adicionales" -> "1 integrante adicional" (plurales simples del español). */
export function countLabel(value: string, label: string): string {
  const text = label.toLowerCase();
  if (value !== '1') return `${value} ${text}`;
  const singular = text
    .split(' ')
    .map((w) => (/[lrndz]es$/.test(w) ? w.slice(0, -2) : /[aeiou]s$/.test(w) ? w.slice(0, -1) : w))
    .join(' ');
  return `1 ${singular}`;
}

export interface ProfileInfo {
  profile: ProfileField[];
  /** 2-3 datos clave para listados (sin el nombre ni textos largos). */
  highlights: string[];
  answerCount: number;
  lastActivityAt: Date;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Perfil, datos clave y última actividad de varias solicitudes en una sola consulta. */
  async profilesFor(apps: { id: string; createdAt: Date }[]): Promise<Map<string, ProfileInfo>> {
    const sessions = await this.prisma.conversationSession.findMany({
      where: { applicationId: { in: apps.map((a) => a.id) } },
      orderBy: { startedAt: 'desc' },
      include: { answers: true, version: { include: { questions: true } } },
    });
    const result = new Map<string, ProfileInfo>();
    for (const app of apps) {
      const session = sessions.find((s) => s.applicationId === app.id);
      if (!session) {
        result.set(app.id, { profile: [], highlights: [], answerCount: 0, lastActivityAt: app.createdAt });
        continue;
      }
      const questions = session.version.questions.map(toEngineQuestion);
      const map = toAnswerMap(questions, session.answers);
      const profile = buildProfile(questions, map);
      result.set(app.id, {
        profile,
        highlights: (profile.some((f) => V2_HIGHLIGHTS.includes(f.key))
          ? V2_HIGHLIGHTS.map((k) => profile.find((f) => f.key === k)).filter((f): f is ProfileField => Boolean(f))
          : profile.filter((f) => !NAME_KEYS.has(f.key) && !f.long && f.type !== 'yes_no' && HIGHLIGHT_TYPES.has(f.type)))
          .slice(0, 3)
          .map((f) => (f.type === 'number' ? countLabel(f.value, f.label) : f.value)),
        answerCount: session.answers.length,
        lastActivityAt: lastApplicantActivity(session.startedAt, session.answers.map((a) => a.createdAt), app.createdAt),
      });
    }
    return result;
  }

  async list(q: z.infer<typeof ListQuerySchema>) {
    const cutoff = abandonCutoff();
    const base: Prisma.ApplicationWhereInput = {
      ...(q.assignedUserId === 'none'
        ? { assignedUserId: null }
        : q.assignedUserId
          ? { assignedUserId: q.assignedUserId }
          : {}),
      ...(q.search ? { displayName: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    // El filtro de estado sólo aplica a solicitudes enviadas o a "todas".
    const statusFilter = q.status && (q.view === 'submitted' || q.view === 'all') ? { status: q.status } : {};
    const where: Prisma.ApplicationWhereInput = { AND: [base, segmentWhere(q.view, cutoff), statusFilter] };

    const [total, items, submitted, inProgress, abandoned] = await this.prisma.$transaction([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        // Enviadas más recientes primero; conversaciones sin enviar, por fecha de inicio.
        orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { assignedUser: { select: { id: true, displayName: true } } },
      }),
      this.prisma.application.count({ where: { AND: [base, segmentWhere('submitted', cutoff)] } }),
      this.prisma.application.count({ where: { AND: [base, segmentWhere('in_progress', cutoff)] } }),
      this.prisma.application.count({ where: { AND: [base, segmentWhere('abandoned', cutoff)] } }),
    ]);
    const profiles = await this.profilesFor(items);
    return {
      total,
      page: q.page,
      limit: q.limit,
      segments: { submitted, in_progress: inProgress, abandoned, all: submitted + inProgress + abandoned },
      items: items.map((a) => {
        const p = profiles.get(a.id)!;
        return {
          ...a,
          answerCount: p.answerCount,
          highlights: p.highlights,
          lastActivityAt: p.lastActivityAt,
          segment: segmentOf(a.status, p.lastActivityAt, cutoff) as Segment,
        };
      }),
    };
  }

  private async getOrThrow(id: string) {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('Solicitud inexistente.');
    return app;
  }

  async detail(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        assignedUser: { select: { id: true, displayName: true } },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { id: true, displayName: true } } } },
        interviews: { orderBy: { scheduledAt: 'desc' }, include: { advisor: { select: { id: true, displayName: true } } } },
        sessions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: {
            version: { include: { questionnaire: true, questions: { orderBy: { order: 'asc' } } } },
            answers: { include: { revisions: { orderBy: { createdAt: 'asc' } } } },
            contact: {
              include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 1 } },
            },
          },
        },
      },
    });
    if (!app) throw new NotFoundException('Solicitud inexistente.');
    const { sessions, ...rest } = app;
    const session = sessions[0];
    let answers: Array<{
      questionKey: string; label: string; type: string; order: number;
      value: AnswerValue; display: string; rawText: string | null; answeredAt: Date;
    }> = [];
    let profile: ProfileField[] = [];
    let summary: string[] = [];
    let dossier: Dossier | null = null;
    if (session) {
      const questions = session.version.questions.map(toEngineQuestion);
      const byId = new Map(questions.map((q) => [q.id, q]));
      const map: AnswerMap = toAnswerMap(questions, session.answers);
      answers = session.answers
        .map((a) => {
          const q = byId.get(a.questionId)!;
          const value = (a.valueJson ?? null) as AnswerValue;
          return {
            questionKey: stepId(q.key, a.instance), label: q.label, type: q.type, order: q.order,
            value, display: formatAnswer(q, value), rawText: a.rawText, answeredAt: a.createdAt,
          };
        })
        .sort((a, b) => a.order - b.order || a.questionKey.localeCompare(b.questionKey));
      profile = buildProfile(questions, map);
      summary = buildSummary(questions, map);
      // Ficha por secciones e integrantes (preentrevista v2 o cualquier versión con secciones).
      if (session.version.templateKey || questions.some((q) => q.meta?.section)) {
        dossier = buildDossier({
          questions,
          rows: session.answers,
          answers: map,
          notes: app.notes as ObservationNote[],
          version: { title: session.version.title, templateKey: session.version.templateKey },
        });
      }
    }
    const lastActivityAt = lastApplicantActivity(
      session?.startedAt,
      session?.answers.map((a) => a.createdAt) ?? [],
      app.createdAt,
    );
    return {
      ...rest,
      segment: segmentOf(app.status, lastActivityAt),
      lastActivityAt,
      // Datos de contacto del canal: sólo para asesores autenticados.
      contact: session?.contact
        ? {
            channel: session.contact.channel,
            phone: session.contact.externalUserId,
            consentAt: session.contact.consentAt,
            optedOut: Boolean(session.contact.optedOutAt),
            lastInboundAt: session.contact.lastInboundAt,
            lastDelivery: session.contact.deliveries[0]
              ? {
                  status: session.contact.deliveries[0].status,
                  errorCode: session.contact.deliveries[0].errorCode,
                  at: session.contact.deliveries[0].updatedAt,
                }
              : null,
          }
        : null,
      session: session
        ? {
            id: session.id,
            status: session.status,
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            questionnaire: {
              name: session.version.questionnaire.name,
              version: session.version.version,
              title: session.version.title,
              templateKey: session.version.templateKey,
            },
            reviewConfirmedAt: session.reviewConfirmedAt,
            consentAt: session.consentAt,
            consentVersion: session.consentVersion,
          }
        : null,
      answers,
      dossier,
      profile,
      summary,
    };
  }

  async update(id: string, input: z.infer<typeof UpdateSchema>, advisor: AdvisorPrincipal) {
    const app = await this.getOrThrow(id);
    if (input.status === ApplicationStatus.IN_PROGRESS && app.status !== ApplicationStatus.IN_PROGRESS) {
      throw new BadRequestException('Una solicitud enviada no puede volver a "En curso".');
    }
    if (input.assignedUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: input.assignedUserId } });
      if (!user) throw new BadRequestException('Asesor inexistente.');
    }
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.ApplicationUncheckedUpdateInput = {};
      if (input.status && input.status !== app.status) {
        data.status = input.status;
        await this.activity.log(id, 'STATUS_CHANGED', advisorActor(advisor), { from: app.status, to: input.status }, tx);
      }
      if (input.assignedUserId !== undefined && input.assignedUserId !== app.assignedUserId) {
        data.assignedUserId = input.assignedUserId;
        await this.activity.log(id, 'ASSIGNED', advisorActor(advisor), { assignedUserId: input.assignedUserId }, tx);
      }
      return tx.application.update({ where: { id }, data, include: { assignedUser: { select: { id: true, displayName: true } } } });
    });
  }

  /**
   * Nota general u observación sobre una respuesta. Nunca modifica la declaración del interesado:
   * se guarda aparte, con autor y fecha.
   */
  async addNote(id: string, input: z.infer<typeof NoteSchema>, advisor: AdvisorPrincipal) {
    await this.getOrThrow(id);
    const kind = input.kind ?? (input.questionKey ? 'OBSERVATION' : 'NOTE');
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: { applicationId: id, authorId: advisor.id, content: input.content, kind, questionKey: input.questionKey ?? null },
        include: { author: { select: { id: true, displayName: true } } },
      });
      await this.activity.log(id, 'NOTE_ADDED', advisorActor(advisor), { noteId: note.id, kind, questionKey: input.questionKey ?? null }, tx);
      return note;
    });
  }

  /** Auditoría: quién exportó la ficha y cuándo (sin contenido). */
  async logExport(id: string, advisor: AdvisorPrincipal) {
    await this.activity.log(id, 'PDF_EXPORTED', advisorActor(advisor), undefined);
  }

  /** Marca resuelta una aclaración pendiente (la nota original se conserva). */
  async resolveNote(id: string, noteId: string, advisor: AdvisorPrincipal) {
    const note = await this.prisma.note.findFirst({ where: { id: noteId, applicationId: id } });
    if (!note) throw new NotFoundException('Nota inexistente.');
    if (note.kind !== 'CLARIFICATION') throw new BadRequestException('Sólo se resuelven aclaraciones pendientes.');
    if (note.resolvedAt) return note;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.note.update({
        where: { id: noteId },
        data: { resolvedAt: new Date(), resolvedById: advisor.id },
        include: { author: { select: { id: true, displayName: true } } },
      });
      await this.activity.log(id, 'CLARIFICATION_RESOLVED', advisorActor(advisor), { noteId, questionKey: note.questionKey }, tx);
      return updated;
    });
  }

  async activityFor(id: string) {
    await this.getOrThrow(id);
    const [events, users, questions] = await Promise.all([
      this.prisma.activityEvent.findMany({ where: { applicationId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.user.findMany({ select: { id: true, displayName: true } }),
      this.prisma.question.findMany({
        where: { version: { sessions: { some: { applicationId: id } } } },
        select: { key: true, label: true },
      }),
    ]);
    const names = new Map(users.map((u) => [u.id, u.displayName]));
    const labels = new Map(questions.map((q) => [q.key, q.label]));
    return events.map((e) => {
      const payload = (e.payloadJson ?? null) as Record<string, unknown> | null;
      const questionKey = typeof payload?.questionKey === 'string' ? payload.questionKey : null;
      return {
        ...e,
        payloadJson: questionKey ? { ...payload, questionLabel: labels.get(questionKey.split('#')[0]!) ?? null } : payload,
        actorName: e.actorId ? (names.get(e.actorId) ?? null) : null,
      };
    });
  }
}
