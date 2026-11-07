import type { Question } from '@prisma/client';
import type {
  AnswerMap, AnswerValue, ChoiceOption, EngineQuestion, QuestionCondition, QuestionMeta, QuestionValidation, Step,
} from '../engine/conversation-engine';
import { stepId } from '../engine/conversation-engine';

export function toEngineQuestion(q: Question): EngineQuestion {
  return {
    id: q.id,
    key: q.key,
    label: q.label,
    shortLabel: q.shortLabel,
    type: q.type,
    required: q.required,
    order: q.order,
    options: (q.optionsJson as ChoiceOption[] | null) ?? null,
    condition: (q.conditionJson as QuestionCondition | null) ?? null,
    validation: (q.validationJson as QuestionValidation | null) ?? null,
    meta: (q.metaJson as QuestionMeta | null) ?? null,
  };
}

/** Respuestas guardadas → mapa por paso (`clave` o `clave#integrante`). */
export function toAnswerMap(
  questions: EngineQuestion[],
  rows: { questionId: string; instance: string; valueJson: unknown }[],
): AnswerMap {
  const keyById = new Map(questions.map((q) => [q.id, q.key]));
  const map: AnswerMap = {};
  for (const a of rows) {
    const key = keyById.get(a.questionId);
    if (key) map[stepId(key, a.instance)] = (a.valueJson ?? null) as AnswerValue;
  }
  return map;
}

/** Vista pública de una pregunta (sin reglas internas). */
export function toPublicQuestion(q: EngineQuestion) {
  const m = q.meta ?? {};
  return {
    key: q.key,
    label: q.label,
    type: q.type,
    required: q.required,
    ...(q.options ? { options: q.options } : {}),
    ...(m.section ? { section: m.section } : {}),
    ...(m.help ? { help: m.help } : {}),
    ...(m.placeholder ? { placeholder: m.placeholder } : {}),
    ...(m.allowUnknown ? { allowUnknown: true } : {}),
    ...(m.allowPreferNot ? { allowPreferNot: true } : {}),
    ...(m.otherLabel ? { otherLabel: m.otherLabel } : {}),
    ...(m.role === 'review' || m.role === 'consent' ? { role: m.role } : {}),
  };
}

/** Vista pública de un paso: la pregunta con el texto para esa persona y la clave del paso. */
export function toPublicStep(step: Step, extra: { provinceId?: string } = {}) {
  return {
    ...toPublicQuestion(step.question),
    key: step.id,
    questionKey: step.question.key,
    label: step.label,
    ...(step.member ? { member: { id: step.member.id, name: step.member.name, titular: step.member.titular } } : {}),
    ...(step.question.type === 'locality' && extra.provinceId ? { provinceId: extra.provinceId } : {}),
  };
}
