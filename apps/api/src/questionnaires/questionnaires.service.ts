import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VersionStatus } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { EngineQuestion, validateQuestionnaireDefinition } from '../engine/conversation-engine';
import { toEngineQuestion } from './question-mapper';

const primitive = z.union([z.string(), z.number(), z.boolean()]);

export const DraftQuestionSchema = z.object({
  // Vacíos permitidos en el borrador: el validador del motor los reporta en español al guardar.
  key: z.string().trim().max(41),
  label: z.string().trim().max(300),
  shortLabel: z.string().trim().max(60).nullish(),
  type: z.enum(['text', 'single_choice', 'number', 'yes_no', 'date', 'multi_choice', 'dni', 'phone', 'email', 'locality']),
  required: z.boolean(),
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(60),
        label: z.string().trim().min(1).max(120),
        exclusive: z.boolean().optional(),
      }),
    )
    .max(30)
    .nullish(),
  condition: z
    .object({
      questionKey: z.string(),
      equals: primitive.optional(),
      notEquals: primitive.optional(),
      in: z.array(primitive).optional(),
      includes: z.string().optional(),
      excludes: z.string().optional(),
      answered: z.boolean().optional(),
    })
    .nullish(),
  validation: z
    .object({
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(1).max(2000).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      integer: z.boolean().optional(),
      mustBeTrue: z.boolean().optional(),
      mustBeTrueMessage: z.string().max(300).optional(),
      dateRule: z.enum(['birth', 'birth_adult', 'future', 'past', 'any']).optional(),
      pattern: z.string().max(200).optional(),
      patternMessage: z.string().max(200).optional(),
    })
    .nullish(),
  /** Configuración de la plantilla (secciones, repetición por integrante, catálogos). Se conserva tal cual. */
  meta: z
    .object({
      section: z.string().max(120).optional(),
      help: z.string().max(300).optional(),
      allowUnknown: z.boolean().optional(),
      allowPreferNot: z.boolean().optional(),
      otherLabel: z.string().max(60).optional(),
      repeat: z.enum(['additional_members', 'all_members']).optional(),
      block: z.string().max(40).optional(),
      labelSelf: z.string().max(300).optional(),
      role: z.string().max(40).optional(),
      memberAge: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional(),
      provinceKey: z.string().max(41).optional(),
      placeholder: z.string().max(60).optional(),
    })
    .strict()
    .nullish(),
});
export const DraftSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  /** Título y plantilla de origen del borrador (se heredan al crear un borrador desde una versión). */
  title: z.string().trim().max(120).nullish(),
  templateKey: z.string().max(40).nullish(),
  questions: z.array(DraftQuestionSchema).min(1).max(80),
});
export type DraftInput = z.infer<typeof DraftSchema>;

const json = (v: unknown) =>
  v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

@Injectable()
export class QuestionnairesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Versión publicada más reciente (la que usan las sesiones nuevas). */
  async getActiveVersion() {
    const version = await this.prisma.questionnaireVersion.findFirst({
      where: { status: VersionStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      include: { questions: { orderBy: { order: 'asc' } }, questionnaire: true },
    });
    if (!version) throw new NotFoundException('No hay un cuestionario publicado.');
    return version;
  }

  async getVersionQuestions(versionId: string): Promise<EngineQuestion[]> {
    const questions = await this.prisma.question.findMany({ where: { versionId }, orderBy: { order: 'asc' } });
    return questions.map(toEngineQuestion);
  }

  async list() {
    const items = await this.prisma.questionnaire.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { _count: { select: { questions: true, sessions: true } } },
        },
      },
    });
    return items.map((q) => ({
      id: q.id,
      name: q.name,
      createdAt: q.createdAt,
      versions: q.versions.map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        title: v.title,
        templateKey: v.templateKey,
        publishedAt: v.publishedAt,
        createdAt: v.createdAt,
        questionCount: v._count.questions,
        sessionCount: v._count.sessions,
      })),
    }));
  }

  async getDetail(id: string) {
    const q = await this.prisma.questionnaire.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { questions: { orderBy: { order: 'asc' } }, _count: { select: { sessions: true } } },
        },
      },
    });
    if (!q) throw new NotFoundException('Cuestionario inexistente.');
    return {
      id: q.id,
      name: q.name,
      versions: q.versions.map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        title: v.title,
        templateKey: v.templateKey,
        publishedAt: v.publishedAt,
        createdAt: v.createdAt,
        sessionCount: v._count.sessions,
        questions: v.questions.map(toEngineQuestion),
        errors: v.status === VersionStatus.DRAFT ? validateQuestionnaireDefinition(v.questions.map(toEngineQuestion)) : [],
      })),
    };
  }

  /** Crea o reemplaza el borrador. Las versiones publicadas nunca se modifican. */
  async saveDraft(questionnaireId: string, input: DraftInput) {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { id: questionnaireId },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!questionnaire) throw new NotFoundException('Cuestionario inexistente.');

    return this.prisma.$transaction(async (tx) => {
      if (input.name) {
        await tx.questionnaire.update({ where: { id: questionnaireId }, data: { name: input.name } });
      }
      let draft = questionnaire.versions.find((v) => v.status === VersionStatus.DRAFT);
      if (!draft) {
        const nextNumber = (questionnaire.versions[0]?.version ?? 0) + 1;
        draft = await tx.questionnaireVersion.create({
          data: {
            questionnaireId,
            version: nextNumber,
            status: VersionStatus.DRAFT,
            title: input.title?.trim() || null,
            templateKey: input.templateKey ?? null,
          },
        });
      }
      const draftId = draft.id;
      await tx.question.deleteMany({ where: { versionId: draftId } });
      await tx.question.createMany({
        data: input.questions.map((q, i) => ({
          versionId: draftId,
          key: q.key,
          label: q.label,
          shortLabel: q.shortLabel?.trim() || null,
          type: q.type,
          required: q.required,
          order: i + 1,
          optionsJson: q.type === 'single_choice' || q.type === 'multi_choice' ? json(q.options) : Prisma.DbNull,
          conditionJson: json(q.condition),
          validationJson: json(q.validation),
          metaJson: json(q.meta),
        })),
      });
      const errors = validateQuestionnaireDefinition(
        input.questions.map((q, i) => ({ ...q, id: String(i), order: i + 1 }) as EngineQuestion),
      );
      return { versionId: draftId, version: draft.version, errors };
    });
  }

  /** Descarta el borrador (sólo versiones DRAFT; las publicadas nunca se borran). */
  async discardDraft(questionnaireId: string) {
    const draft = await this.prisma.questionnaireVersion.findFirst({
      where: { questionnaireId, status: VersionStatus.DRAFT },
      include: { _count: { select: { sessions: true } } },
    });
    if (!draft) throw new NotFoundException('No hay borrador para descartar.');
    if (draft._count.sessions > 0) throw new BadRequestException('El borrador tiene sesiones asociadas.');
    await this.prisma.questionnaireVersion.delete({ where: { id: draft.id } });
    return { ok: true };
  }

  /** Publica el borrador: pasa a ser la versión activa; la anterior queda archivada. */
  async publish(questionnaireId: string) {
    const draft = await this.prisma.questionnaireVersion.findFirst({
      where: { questionnaireId, status: VersionStatus.DRAFT },
      include: { questions: true },
    });
    if (!draft) throw new BadRequestException('No hay borrador para publicar.');
    const errors = validateQuestionnaireDefinition(draft.questions.map(toEngineQuestion));
    if (errors.length) throw new BadRequestException({ message: 'El borrador tiene errores.', errors });

    return this.prisma.$transaction(async (tx) => {
      await tx.questionnaireVersion.updateMany({
        where: { status: VersionStatus.PUBLISHED },
        data: { status: VersionStatus.ARCHIVED },
      });
      return tx.questionnaireVersion.update({
        where: { id: draft.id },
        data: { status: VersionStatus.PUBLISHED, publishedAt: new Date() },
      });
    });
  }
}
