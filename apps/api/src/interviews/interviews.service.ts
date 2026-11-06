import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, ApplicationStatus, InterviewStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { AdvisorPrincipal } from '../auth/auth.service';

const isoDate = z.string().datetime({ offset: true, message: 'Fecha/hora inválida (ISO 8601).' });

export const InterviewListSchema = z.object({
  status: z.nativeEnum(InterviewStatus).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  applicationId: z.string().max(40).optional(),
});

export const CreateInterviewSchema = z.object({
  applicationId: z.string().min(1).max(40),
  advisorId: z.string().max(40).optional(),
  scheduledAt: isoDate,
  notes: z.string().trim().max(2000).optional(),
  nextStep: z.string().trim().max(500).optional(),
});

export const UpdateInterviewSchema = z
  .object({
    scheduledAt: isoDate.optional(),
    status: z.nativeEnum(InterviewStatus).optional(),
    advisorId: z.string().max(40).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    nextStep: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para actualizar.');

const include = {
  application: { select: { id: true, displayName: true, status: true } },
  advisor: { select: { id: true, displayName: true } },
} satisfies Prisma.InterviewInclude;

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  list(q: z.infer<typeof InterviewListSchema>) {
    return this.prisma.interview.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.applicationId ? { applicationId: q.applicationId } : {}),
        ...(q.from || q.to
          ? { scheduledAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
          : {}),
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      include,
    });
  }

  private async assertAdvisor(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new BadRequestException('Asesor inexistente.');
  }

  async create(input: z.infer<typeof CreateInterviewSchema>, advisor: AdvisorPrincipal) {
    const app = await this.prisma.application.findUnique({ where: { id: input.applicationId } });
    if (!app) throw new NotFoundException('Solicitud inexistente.');
    if (new Date(input.scheduledAt).getTime() < Date.now() - 5 * 60 * 1000) {
      throw new BadRequestException('La entrevista debe programarse en una fecha y hora futura.');
    }
    const advisorId = input.advisorId ?? advisor.id;
    await this.assertAdvisor(advisorId);
    const actor = { type: ActorType.ADVISOR, id: advisor.id };

    return this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.create({
        data: {
          applicationId: app.id,
          advisorId,
          scheduledAt: new Date(input.scheduledAt),
          notes: input.notes || null,
          nextStep: input.nextStep || null,
        },
        include,
      });
      await this.activity.log(app.id, 'INTERVIEW_SCHEDULED', actor, { interviewId: interview.id, scheduledAt: input.scheduledAt }, tx);
      if (app.status !== ApplicationStatus.CLOSED && app.status !== ApplicationStatus.INTERVIEW_SCHEDULED) {
        await tx.application.update({ where: { id: app.id }, data: { status: ApplicationStatus.INTERVIEW_SCHEDULED } });
        await this.activity.log(app.id, 'STATUS_CHANGED', actor, { from: app.status, to: ApplicationStatus.INTERVIEW_SCHEDULED }, tx);
      }
      return interview;
    });
  }

  async update(id: string, input: z.infer<typeof UpdateInterviewSchema>, advisor: AdvisorPrincipal) {
    const existing = await this.prisma.interview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Entrevista inexistente.');
    if (input.advisorId) await this.assertAdvisor(input.advisorId);

    return this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.update({
        where: { id },
        data: {
          ...(input.scheduledAt ? { scheduledAt: new Date(input.scheduledAt) } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.advisorId ? { advisorId: input.advisorId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
          ...(input.nextStep !== undefined ? { nextStep: input.nextStep || null } : {}),
        },
        include,
      });
      await this.activity.log(
        existing.applicationId,
        input.status === InterviewStatus.CANCELLED ? 'INTERVIEW_CANCELLED'
          : input.status === InterviewStatus.COMPLETED ? 'INTERVIEW_COMPLETED' : 'INTERVIEW_UPDATED',
        { type: ActorType.ADVISOR, id: advisor.id },
        { interviewId: id, fields: Object.keys(input) },
        tx,
      );
      return interview;
    });
  }
}
