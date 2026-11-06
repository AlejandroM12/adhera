import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, ApplicationStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { AdvisorPrincipal } from '../auth/auth.service';
import { toEngineQuestion } from '../questionnaires/question-mapper';
import {
  AnswerMap, AnswerValue, buildProfile, buildSummary, formatAnswer, ProfileField,
} from '../engine/conversation-engine';
import { abandonCutoff, lastApplicantActivity, Segment, segmentOf, segmentWhere } from './segments';

export const ListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.nativeEnum(ApplicationStatus).optional(),
  assignedUserId: z.string().max(40).optional(),
  // submitted = enviadas o en gestión; in_progress = conversación activa; abandoned = sin actividad.
  view: z.enum(['all', 'submitted', 'in_progress', 'abandoned']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const UpdateSchema = z
  .object({
    status: z.nativeEnum(ApplicationStatus).optional(),
    assignedUserId: z.string().max(40).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.assignedUserId !== undefined, 'Nada para actualizar.');

const advisorActor = (a: AdvisorPrincipal) => ({ type: ActorType.ADVISOR, id: a.id });

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
      const byId = new Map(questions.map((q) => [q.id, q.key]));
      const map: AnswerMap = {};
      for (const a of session.answers) {
        const key = byId.get(a.questionId);
        if (key) map[key] = (a.valueJson ?? null) as AnswerValue;
      }
      const profile = buildProfile(questions, map);
      result.set(app.id, {
        profile,
        highlights: profile
          .filter((f) => f.key !== 'full_name' && !f.long && f.type !== 'yes_no')
          .slice(0, 3)
          .map((f) => (f.type === 'number' ? `${f.value} ${f.label.toLowerCase()}` : f.value)),
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
            answers: true,
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
    if (session) {
      const questions = session.version.questions.map(toEngineQuestion);
      const byId = new Map(questions.map((q) => [q.id, q]));
      const map: AnswerMap = {};
      answers = session.answers
        .map((a) => {
          const q = byId.get(a.questionId)!;
          const value = (a.valueJson ?? null) as AnswerValue;
          map[q.key] = value;
          return {
            questionKey: q.key, label: q.label, type: q.type, order: q.order,
            value, display: formatAnswer(q, value), rawText: a.rawText, answeredAt: a.createdAt,
          };
        })
        .sort((a, b) => a.order - b.order);
      profile = buildProfile(questions, map);
      summary = buildSummary(questions, map);
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
            questionnaire: { name: session.version.questionnaire.name, version: session.version.version },
          }
        : null,
      answers,
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

  async addNote(id: string, content: string, advisor: AdvisorPrincipal) {
    await this.getOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: { applicationId: id, authorId: advisor.id, content },
        include: { author: { select: { id: true, displayName: true } } },
      });
      await this.activity.log(id, 'NOTE_ADDED', advisorActor(advisor), { noteId: note.id }, tx);
      return note;
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
        payloadJson: questionKey ? { ...payload, questionLabel: labels.get(questionKey) ?? null } : payload,
        actorName: e.actorId ? (names.get(e.actorId) ?? null) : null,
      };
    });
  }
}
