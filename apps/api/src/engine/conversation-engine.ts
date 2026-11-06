/**
 * ConversationEngine: lógica pura y determinística del cuestionario.
 * No conoce el canal (simulador / WhatsApp) ni la base de datos.
 */

export type QuestionType = 'text' | 'single_choice' | 'number' | 'yes_no' | 'date';

export interface ChoiceOption {
  value: string;
  label: string;
}

/** Condición simple: la pregunta se muestra si la respuesta a `questionKey` cumple la regla. */
export interface QuestionCondition {
  questionKey: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  in?: Array<string | number | boolean>;
}

export interface QuestionValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface EngineQuestion {
  id: string;
  key: string;
  label: string;
  type: QuestionType;
  required: boolean;
  order: number;
  /** Etiqueta breve para la ficha comercial (ej. "Ciudad"). */
  shortLabel?: string | null;
  options?: ChoiceOption[] | null;
  condition?: QuestionCondition | null;
  validation?: QuestionValidation | null;
}

export type AnswerValue = string | number | boolean | null;
export type AnswerMap = Record<string, AnswerValue>;

export interface Progress {
  answered: number;
  total: number;
}

export function sortQuestions(questions: EngineQuestion[]): EngineQuestion[] {
  return [...questions].sort((a, b) => a.order - b.order);
}

export function isConditionMet(condition: QuestionCondition | null | undefined, answers: AnswerMap): boolean {
  if (!condition) return true;
  if (!(condition.questionKey in answers)) return false;
  const value = answers[condition.questionKey];
  if (condition.equals !== undefined && value !== condition.equals) return false;
  if (condition.notEquals !== undefined && value === condition.notEquals) return false;
  if (condition.in !== undefined && !condition.in.includes(value as string | number | boolean)) return false;
  return true;
}

/** Preguntas visibles según las respuestas actuales (en orden). */
export function visibleQuestions(questions: EngineQuestion[], answers: AnswerMap): EngineQuestion[] {
  return sortQuestions(questions).filter((q) => isConditionMet(q.condition, answers));
}

/** Primera pregunta visible sin responder; null si el cuestionario está terminado. */
export function nextQuestion(questions: EngineQuestion[], answers: AnswerMap): EngineQuestion | null {
  return visibleQuestions(questions, answers).find((q) => !(q.key in answers)) ?? null;
}

export function computeProgress(questions: EngineQuestion[], answers: AnswerMap): Progress {
  const visible = visibleQuestions(questions, answers);
  return { answered: visible.filter((q) => q.key in answers).length, total: visible.length };
}

export function canComplete(questions: EngineQuestion[], answers: AnswerMap): boolean {
  return nextQuestion(questions, answers) === null;
}

export type ValidationResult = { ok: true; value: AnswerValue } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida y normaliza un valor según el tipo y reglas de la pregunta. */
export function validateAnswer(question: EngineQuestion, raw: unknown): ValidationResult {
  const empty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
  if (empty) {
    return question.required
      ? { ok: false, error: 'Esta pregunta es obligatoria.' }
      : { ok: true, value: null };
  }
  const v = question.validation ?? {};

  switch (question.type) {
    case 'text': {
      if (typeof raw !== 'string') return { ok: false, error: 'Se esperaba un texto.' };
      const value = raw.trim();
      const min = v.minLength ?? 1;
      const max = v.maxLength ?? 500;
      if (value.length < min) return { ok: false, error: `Ingresá al menos ${min} caracteres.` };
      if (value.length > max) return { ok: false, error: `Máximo ${max} caracteres.` };
      return { ok: true, value };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim().replace(',', '.')) : NaN;
      if (!Number.isFinite(n)) return { ok: false, error: 'Ingresá un número válido.' };
      if (v.integer !== false && !Number.isInteger(n)) return { ok: false, error: 'Ingresá un número entero.' };
      if (v.min !== undefined && n < v.min) return { ok: false, error: `El mínimo es ${v.min}.` };
      if (v.max !== undefined && n > v.max) return { ok: false, error: `El máximo es ${v.max}.` };
      return { ok: true, value: n };
    }
    case 'single_choice': {
      const options = question.options ?? [];
      const value = String(raw);
      const match = options.find((o) => o.value === value) ??
        options.find((o) => o.label.toLowerCase() === value.trim().toLowerCase());
      if (!match) return { ok: false, error: 'Elegí una de las opciones disponibles.' };
      return { ok: true, value: match.value };
    }
    case 'yes_no': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      const s = String(raw).trim().toLowerCase();
      if (['si', 'sí', 'true', 'yes'].includes(s)) return { ok: true, value: true };
      if (['no', 'false'].includes(s)) return { ok: true, value: false };
      return { ok: false, error: 'Respondé "Sí" o "No".' };
    }
    case 'date': {
      const s = String(raw).trim();
      if (!DATE_RE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
        return { ok: false, error: 'Ingresá una fecha válida (AAAA-MM-DD).' };
      }
      return { ok: true, value: s };
    }
    default:
      return { ok: false, error: 'Tipo de pregunta no soportado.' };
  }
}

/** Texto legible de una respuesta (para chat, ficha y resumen). */
export function formatAnswer(question: EngineQuestion, value: AnswerValue): string {
  if (value === null || value === undefined) return 'Sin respuesta';
  if (question.type === 'yes_no') return value ? 'Sí' : 'No';
  if (question.type === 'single_choice') {
    return question.options?.find((o) => o.value === value)?.label ?? String(value);
  }
  return String(value);
}

/**
 * Valida la estructura de un cuestionario antes de publicarlo.
 * Devuelve lista de errores (vacía si es válido).
 */
export function validateQuestionnaireDefinition(questions: EngineQuestion[]): string[] {
  const errors: string[] = [];
  const sorted = sortQuestions(questions);
  if (sorted.length === 0) errors.push('El cuestionario debe tener al menos una pregunta.');
  const seen = new Map<string, EngineQuestion>();
  for (const q of sorted) {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(q.key)) {
      errors.push(`Clave inválida "${q.key}": usar minúsculas, números y guion bajo.`);
    }
    if (seen.has(q.key)) errors.push(`Clave duplicada "${q.key}".`);
    if (!q.label.trim()) errors.push(`La pregunta ${sorted.indexOf(q) + 1} no tiene texto.`);
    if ((q.shortLabel ?? '').length > 60) errors.push(`La etiqueta de la pregunta ${sorted.indexOf(q) + 1} supera 60 caracteres.`);
    if (q.type === 'single_choice') {
      const opts = q.options ?? [];
      if (opts.length < 2) errors.push(`"${q.key}" necesita al menos 2 opciones.`);
      const values = new Set(opts.map((o) => o.value));
      if (values.size !== opts.length) errors.push(`"${q.key}" tiene opciones duplicadas.`);
    }
    if (q.condition) {
      const ref = seen.get(q.condition.questionKey);
      if (!ref) {
        errors.push(`"${q.key}" depende de "${q.condition.questionKey}", que debe existir y estar antes.`);
      } else {
        const expected = [q.condition.equals, q.condition.notEquals, ...(q.condition.in ?? [])].filter(
          (x) => x !== undefined,
        );
        if (expected.length === 0) errors.push(`La condición de "${q.key}" no define un valor.`);
        if (ref.type === 'single_choice') {
          const valid = new Set((ref.options ?? []).map((o) => o.value));
          for (const e of expected) {
            if (!valid.has(String(e))) errors.push(`La condición de "${q.key}" usa la opción inexistente "${e}".`);
          }
        }
        if (ref.type === 'yes_no') {
          for (const e of expected) {
            if (typeof e !== 'boolean') errors.push(`La condición de "${q.key}" debe comparar con Sí/No.`);
          }
        }
      }
    }
    seen.set(q.key, q);
  }
  return errors;
}

/** Etiquetas profesionales por defecto para versiones publicadas sin `shortLabel`. */
export const DEFAULT_SHORT_LABELS: Record<string, string> = {
  full_name: 'Nombre',
  coverage_type: 'Tipo de cobertura',
  members_count: 'Integrantes',
  city: 'Ciudad',
  contact_channel: 'Contacto preferido',
  availability: 'Franja horaria',
  wants_comments: 'Dejó observaciones',
  comments: 'Observaciones',
};

/** Etiqueta para la ficha: la configurada, la de referencia o el texto de la pregunta sin signos. */
export function profileLabel(q: EngineQuestion): string {
  const configured = q.shortLabel?.trim();
  if (configured) return configured;
  if (DEFAULT_SHORT_LABELS[q.key]) return DEFAULT_SHORT_LABELS[q.key]!;
  const clean = q.label.replace(/\([^)]*\)/g, '').replace(/[¿?¡!]/g, '').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export interface ProfileField {
  key: string;
  label: string;
  value: string;
  type: QuestionType;
  /** Texto libre largo: se muestra a ancho completo. */
  long: boolean;
}

/**
 * Perfil comercial determinístico construido sólo con respuestas presentes.
 * No infiere datos ausentes y omite el "Sí" que sólo habilita otra pregunta ya respondida.
 */
export function buildProfile(questions: EngineQuestion[], answers: AnswerMap): ProfileField[] {
  const fields: ProfileField[] = [];
  const visible = visibleQuestions(questions, answers);
  for (const q of visible) {
    if (!(q.key in answers)) continue;
    const value = answers[q.key];
    if (value === null) continue;
    // Un Sí/No que sólo habilita otra pregunta no aporta al perfil: se omite si es "No"
    // o si la pregunta habilitada ya fue respondida.
    const isGate = q.type === 'yes_no' && questions.some((o) => o.condition?.questionKey === q.key);
    const gatedAnswered = visible.some((o) => o.condition?.questionKey === q.key && answers[o.key] !== undefined && answers[o.key] !== null);
    if (isGate && (value === false || gatedAnswered)) continue;
    const display = formatAnswer(q, value);
    fields.push({ key: q.key, label: profileLabel(q), value: display, type: q.type, long: q.type === 'text' && display.length > 40 });
  }
  return fields;
}

/** Resumen en líneas "Etiqueta: valor" (derivado del perfil). */
export function buildSummary(questions: EngineQuestion[], answers: AnswerMap): string[] {
  return buildProfile(questions, answers).map((f) => `${f.label}: ${f.value}`);
}
