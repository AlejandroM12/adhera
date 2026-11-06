import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApplicationStatus, InterviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AdvisorGuard } from '../auth/advisor.guard';
import { ApplicationsService } from '../applications/applications.service';
import { abandonCutoff, abandonedWhere } from '../applications/segments';

const DAY = 24 * 60 * 60 * 1000;

/** Indicadores comerciales y listas accionables, siempre calculados desde la base. */
@Controller('dashboard')
@UseGuards(AdvisorGuard)
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
  ) {}

  @Get('summary')
  async summary() {
    const now = new Date();
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    const cutoff = abandonCutoff(now);
    const started30: Prisma.ApplicationWhereInput = {
      createdAt: { gte: ago(30) },
      sessions: { some: { answers: { some: {} } } },
    };
    // Abandonadas recuperables: dejaron al menos un dato (nombre) para poder contactarlas.
    const recoverable: Prisma.ApplicationWhereInput = {
      AND: [abandonedWhere(cutoff), { sessions: { some: { answers: { some: {} } } } }],
    };

    // Pidieron hablar con un asesor y todavía no fueron gestionadas.
    const handoffOpen: Prisma.ApplicationWhereInput = {
      handoffRequestedAt: { not: null },
      status: { in: [ApplicationStatus.IN_PROGRESS, ApplicationStatus.PENDING_REVIEW] },
    };
    const [
      handoffPending,
      newThisWeek, newPrevWeek, pendingReview, unassignedPending, upcoming7d, inProgress, abandonedCount,
      started, submitted, managed, withInterview,
      toReview, nextInterviews, abandoned, recent, users,
    ] = await Promise.all([
      this.prisma.application.count({ where: handoffOpen }),
      this.prisma.application.count({ where: { completedAt: { gte: ago(7) } } }),
      this.prisma.application.count({ where: { completedAt: { gte: ago(14), lt: ago(7) } } }),
      this.prisma.application.count({ where: { status: ApplicationStatus.PENDING_REVIEW } }),
      this.prisma.application.count({ where: { status: ApplicationStatus.PENDING_REVIEW, assignedUserId: null } }),
      this.prisma.interview.count({
        where: { status: InterviewStatus.SCHEDULED, scheduledAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } },
      }),
      this.prisma.application.count({ where: { status: ApplicationStatus.IN_PROGRESS, NOT: abandonedWhere(cutoff) } }),
      this.prisma.application.count({ where: recoverable }),
      // Embudo de los últimos 30 días
      this.prisma.application.count({ where: started30 }),
      this.prisma.application.count({ where: { ...started30, completedAt: { not: null } } }),
      this.prisma.application.count({
        where: {
          ...started30,
          completedAt: { not: null },
          status: { in: [ApplicationStatus.CONTACTED, ApplicationStatus.INTERVIEW_SCHEDULED, ApplicationStatus.CLOSED] },
        },
      }),
      this.prisma.application.count({ where: { ...started30, interviews: { some: {} } } }),
      // Pendientes de revisión y derivaciones a asesor abiertas (estas primero).
      this.prisma.application.findMany({
        where: { OR: [{ status: ApplicationStatus.PENDING_REVIEW }, handoffOpen] },
        orderBy: [{ handoffRequestedAt: { sort: 'desc', nulls: 'last' } }, { completedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        take: 6,
        select: {
          id: true, displayName: true, createdAt: true, completedAt: true, channel: true, handoffRequestedAt: true,
          assignedUser: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.interview.findMany({
        where: { status: InterviewStatus.SCHEDULED, scheduledAt: { gte: now } },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: 5,
        include: {
          application: { select: { id: true, displayName: true } },
          advisor: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.application.findMany({
        where: recoverable,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { id: true, displayName: true, createdAt: true, assignedUser: { select: { id: true, displayName: true } } },
      }),
      // Feed sólo con hitos relevantes (sin cada respuesta ni inicios de conversación).
      this.prisma.activityEvent.findMany({
        where: { kind: { notIn: ['ANSWER_RECORDED', 'SESSION_STARTED'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        include: { application: { select: { id: true, displayName: true } } },
      }),
      this.prisma.user.findMany({ select: { id: true, displayName: true } }),
    ]);

    const profiles = await this.applications.profilesFor([...toReview, ...abandoned]);
    const names = new Map(users.map((u) => [u.id, u.displayName]));
    return {
      kpis: {
        newThisWeek,
        newPrevWeek,
        pendingReview,
        unassignedPending,
        handoffPending,
        upcomingInterviews: upcoming7d,
        inProgress,
        abandonedRecoverable: abandonedCount,
        completionRate: started > 0 ? Math.round((submitted / started) * 100) : null,
      },
      funnel: [
        { key: 'started', label: 'Iniciaron la conversación', count: started },
        { key: 'submitted', label: 'Enviaron la solicitud', count: submitted },
        { key: 'managed', label: 'En gestión comercial', count: managed },
        { key: 'interview', label: 'Con entrevista', count: withInterview },
      ],
      toReview: toReview.map((a) => ({ ...a, highlights: profiles.get(a.id)?.highlights ?? [] })),
      upcomingInterviews: nextInterviews,
      abandoned: abandoned.map((a) => ({
        ...a,
        highlights: profiles.get(a.id)?.highlights ?? [],
        answerCount: profiles.get(a.id)?.answerCount ?? 0,
        lastActivityAt: profiles.get(a.id)?.lastActivityAt ?? a.createdAt,
      })),
      recentActivity: recent.map((e) => ({
        id: e.id,
        kind: e.kind,
        actorType: e.actorType,
        actorName: e.actorId ? (names.get(e.actorId) ?? null) : null,
        payloadJson: e.payloadJson,
        createdAt: e.createdAt,
        application: e.application,
      })),
    };
  }
}
