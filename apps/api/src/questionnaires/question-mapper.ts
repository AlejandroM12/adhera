import type { Question } from '@prisma/client';
import type { ChoiceOption, EngineQuestion, QuestionCondition, QuestionValidation } from '../engine/conversation-engine';

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
  };
}

/** Vista pública de una pregunta (sin reglas internas). */
export function toPublicQuestion(q: EngineQuestion) {
  return {
    key: q.key,
    label: q.label,
    type: q.type,
    required: q.required,
    ...(q.options ? { options: q.options } : {}),
  };
}
