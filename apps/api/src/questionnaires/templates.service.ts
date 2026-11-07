import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, ApplicationStatus, Prisma, SessionStatus, VersionStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AdvisorPrincipal } from '../auth/auth.service';
import { expandSteps, validateQuestionnaireDefinition } from '../engine/conversation-engine';
import { toEngineQuestion } from './question-mapper';
import { hashToken } from '../sessions/sessions.service';
import { HEALTH_V2_CONSENT_VERSION, HEALTH_V2_KEY, HEALTH_V2_TITLE, healthV2Questions } from './templates/health-v2';
import { healthV2Examples } from './templates/health-v2.examples';

const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const minutesAfter = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/**
 * Plantillas de cuestionario. Nada de esto modifica ni borra registros existentes:
 * - importar crea un BORRADOR nuevo (sólo si no hay otro borrador);
 * - los casos de ejemplo usan ids fijos y se saltean si ya existen.
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async importHealthV2(questionnaireId: string) {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { id: questionnaireId },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!questionnaire) throw new NotFoundException('Cuestionario inexistente.');
    if (questionnaire.versions.some((v) => v.status === VersionStatus.DRAFT)) {
      throw new ConflictException('Ya hay un borrador. Publicalo o descartalo antes de importar la plantilla.');
    }
    const questions = healthV2Questions();
    const errors = validateQuestionnaireDefinition(questions.map((q, i) => ({ ...q, id: String(i) })));
    if (errors.length) throw new BadRequestException({ message: 'La plantilla tiene errores.', errors });

    const version = await this.prisma.questionnaireVersion.create({
      data: {
        questionnaireId,
        version: (questionnaire.versions[0]?.version ?? 0) + 1,
        status: VersionStatus.DRAFT,
        title: HEALTH_V2_TITLE,
        templateKey: HEALTH_V2_KEY,
        questions: {
          create: questions.map((q) => ({
            key: q.key,
            label: q.label,
            shortLabel: q.shortLabel ?? null,
            type: q.type,
            required: q.required,
            order: q.order,
            optionsJson: json(q.options),
            conditionJson: json(q.condition),
            validationJson: json(q.validation),
            metaJson: json(q.meta),
          })),
        },
      },
    });
    return { versionId: version.id, version: version.version, questionCount: questions.length };
  }

  /** Crea los 4 casos ficticios de ejemplo sobre la preentrevista v2 publicada (idempotente). */
  async createHealthV2Examples(advisor: AdvisorPrincipal) {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { templateKey: HEALTH_V2_KEY, status: { in: [VersionStatus.PUBLISHED, VersionStatus.ARCHIVED] } },
      orderBy: { version: 'desc' },
      include: { questions: true },
    });
    if (!version) throw new BadRequestException('Primero publicá la preentrevista de salud (v2).');
    const questions = version.questions.map(toEngineQuestion);
    const qByKey = new Map(questions.map((q) => [q.key, q]));
    const today = new Date();
    let created = 0;

    for (const ex of healthV2Examples(today)) {
      if (await this.prisma.application.findUnique({ where: { id: ex.id } })) continue;
      const steps = expandSteps(questions, ex.answers, today);
      const missing = steps.filter((s) => !(s.id in ex.answers)).map((s) => s.id);
      if (missing.length) throw new BadRequestException(`El ejemplo ${ex.id} está incompleto: ${missing.join(', ')}`);

      const started = hoursAgo(ex.startedHoursAgo);
      const completedAt = minutesAfter(started, 6 + steps.length);
      const name = `${ex.answers.first_name} ${ex.answers.last_name}`;
      await this.prisma.$transaction(async (tx) => {
        await tx.application.create({
          data: { id: ex.id, displayName: name, status: ex.status, createdAt: started, completedAt },
        });
        const session = await tx.conversationSession.create({
          data: {
            applicationId: ex.id,
            versionId: version.id,
            resumeTokenHash: hashToken(randomBytes(24).toString('base64url')),
            status: SessionStatus.COMPLETED,
            startedAt: started,
            completedAt,
            reviewConfirmedAt: completedAt,
            consentAt: completedAt,
            consentVersion: HEALTH_V2_CONSENT_VERSION,
          },
        });
        for (const [i, step] of steps.entries()) {
          const q = qByKey.get(step.question.key)!;
          const value = ex.answers[step.id] ?? null;
          const raw = ex.raw?.[step.id] ?? (typeof value === 'string' ? value : value === null ? null : JSON.stringify(value));
          const conf = ex.confirmations?.[step.id];
          const answer = await tx.answer.create({
            data: {
              sessionId: session.id,
              questionId: q.id,
              instance: step.instance,
              valueJson: json(value),
              rawText: raw,
              confirmationJson: conf ? json({ ...conf, at: minutesAfter(started, i * 0.3) }) : Prisma.DbNull,
              createdAt: minutesAfter(started, i * 0.3),
            },
          });
          const fix = ex.corrections?.[step.id];
          if (fix) {
            await tx.answerRevision.create({
              data: {
                answerId: answer.id,
                previousValueJson: json(fix.previousValue),
                previousRawText: fix.previousRaw,
                newValueJson: json(value),
                newRawText: raw,
                createdAt: minutesAfter(completedAt, -1),
              },
            });
          }
        }
        const events: Prisma.ActivityEventCreateManyInput[] = [
          { applicationId: ex.id, actorType: ActorType.APPLICANT, kind: 'SESSION_STARTED', payloadJson: { version: version.version, example: true }, createdAt: started },
          { applicationId: ex.id, actorType: ActorType.APPLICANT, kind: 'SESSION_COMPLETED', createdAt: completedAt },
          {
            applicationId: ex.id, actorType: ActorType.SYSTEM, kind: 'STATUS_CHANGED',
            payloadJson: { from: ApplicationStatus.IN_PROGRESS, to: ApplicationStatus.PENDING_REVIEW }, createdAt: completedAt,
          },
        ];
        if (ex.status !== ApplicationStatus.PENDING_REVIEW) {
          events.push({
            applicationId: ex.id, actorType: ActorType.ADVISOR, actorId: advisor.id, kind: 'STATUS_CHANGED',
            payloadJson: { from: ApplicationStatus.PENDING_REVIEW, to: ex.status }, createdAt: minutesAfter(completedAt, 90),
          });
        }
        await tx.activityEvent.createMany({ data: events });
      });
      created++;
    }
    return { created, total: healthV2Examples(today).length };
  }
}
