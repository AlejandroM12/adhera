/**
 * ConversationEngine: lógica pura y determinística del cuestionario.
 * No conoce el canal (simulador / WhatsApp) ni la base de datos.
 *
 * Trabaja con "pasos": cada pregunta visible, una vez por persona cuando la pregunta se repite por
 * integrante del grupo familiar. Un cuestionario sin repeticiones (v1) tiene exactamente un paso por
 * pregunta y su identificador es la clave de la pregunta, por lo que se comporta igual que antes.
 *
 * El motor sólo valida formato, rangos y coherencia de datos declarados. No diagnostica, no puntúa,
 * no rechaza y no infiere información no declarada.
 */
import { normalizeText, similarity } from './text';
import {
  ageOn, DateRule, formatDate, formatDni, formatPhone, Parsed, parseDate, parseDni, parseEmail, parsePhone,
} from './validators';

export type QuestionType =
  | 'text' | 'single_choice' | 'number' | 'yes_no' | 'date'
  | 'multi_choice' | 'dni' | 'phone' | 'email' | 'locality';

export interface ChoiceOption {
  value: string;
  label: string;
  /** En selección múltiple: no se combina con otras opciones (por ejemplo "Ninguno"). */
  exclusive?: boolean;
}

/** Condición: la pregunta se muestra si la respuesta a `questionKey` cumple todas las reglas presentes. */
export interface QuestionCondition {
  questionKey: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  in?: Array<string | number | boolean>;
  /** Selección múltiple: incluye la opción. */
  includes?: string;
  /** Selección múltiple: no incluye la opción. */
  excludes?: string;
  /** true: hay una respuesta concreta (no vacía, ni "No sé", ni "Prefiero no responder"). */
  answered?: boolean;
}

export interface QuestionValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  /** Sí/No que sólo admite "Sí" (confirmaciones y consentimiento). */
  mustBeTrue?: boolean;
  mustBeTrueMessage?: string;
  dateRule?: DateRule;
  /** Texto: expresión regular que debe cumplir (por ejemplo, código postal). */
  pattern?: string;
  patternMessage?: string;
}

/** Rol de una pregunta dentro de la estructura de la preentrevista. */
export type QuestionRole =
  | 'titular_first_name' | 'titular_last_name' | 'titular_dni' | 'birth_date'
  | 'members_count' | 'member_relation' | 'member_name' | 'member_dni' | 'member_birth_date'
  | 'province' | 'locality' | 'plan_type'
  | 'pregnancy' | 'pregnancy_weeks' | 'pregnancy_due'
  | 'review' | 'consent';

export interface QuestionMeta {
  /** Título de la sección (agrupa preguntas en el simulador, la ficha y el PDF). */
  section?: string;
  help?: string;
  allowUnknown?: boolean;
  allowPreferNot?: boolean;
  /** Admite una respuesta "Otro" escrita (texto del botón, ej. "Otro" o "No tengo DNI argentino"). */
  otherLabel?: string;
  /** Repetir por integrante: sólo los adicionales o todos (incluida la persona titular). */
  repeat?: 'additional_members' | 'all_members';
  /** Preguntas consecutivas del mismo bloque se hacen completas para cada persona antes de pasar a la siguiente. */
  block?: string;
  /** Texto en segunda persona cuando la pregunta se refiere a la persona titular. */
  labelSelf?: string;
  role?: QuestionRole;
  /** Sólo para personas cuya edad declarada está en el rango (si la edad no se conoce, se pregunta). */
  memberAge?: { min?: number; max?: number };
  /** Localidad: clave de la pregunta de provincia. */
  provinceKey?: string;
  placeholder?: string;
}

export interface EngineQuestion {
  id: string;
  key: string;
  label: string;
  type: QuestionType;
  required: boolean;
  order: number;
  /** Etiqueta breve para la ficha (ej. "Ciudad"). */
  shortLabel?: string | null;
  options?: ChoiceOption[] | null;
  condition?: QuestionCondition | null;
  validation?: QuestionValidation | null;
  meta?: QuestionMeta | null;
}

export type SpecialAnswer = { special: 'unknown' | 'prefer_not' };
export type OtherAnswer = { other: string };
export type MultiAnswer = { values: string[]; other?: string };
export type LocalityAnswer = {
  id: string | null;
  name: string;
  province: string;
  provinceId: string;
  department?: string;
  /** false: no se encontró en el catálogo; queda para verificar. */
  verified: boolean;
};
export type AnswerValue = string | number | boolean | null | SpecialAnswer | OtherAnswer | MultiAnswer | LocalityAnswer;
/** Respuestas por paso (`clave` o `clave#integrante`). */
export type AnswerMap = Record<string, AnswerValue>;

export const SPECIAL_LABEL = { unknown: 'No sé', prefer_not: 'Prefiero no responder' } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isSpecial = (v: unknown): v is SpecialAnswer =>
  isObj(v) && (v.special === 'unknown' || v.special === 'prefer_not');
export const isOther = (v: unknown): v is OtherAnswer => isObj(v) && typeof v.other === 'string' && !('values' in v);
export const isMulti = (v: unknown): v is MultiAnswer => isObj(v) && Array.isArray(v.values);
export const isLocality = (v: unknown): v is LocalityAnswer => isObj(v) && 'verified' in v && 'provinceId' in v;
/** Hay una respuesta concreta (no vacía ni especial). */
export const isConcrete = (v: AnswerValue | undefined) => v !== undefined && v !== null && !isSpecial(v);

export interface Progress {
  answered: number;
  total: number;
}

// ------------------------------------------------------------------ Integrantes y pasos

export interface Member {
  /** m0 = persona titular; m1..mN = integrantes adicionales. */
  id: string;
  index: number;
  titular: boolean;
  name: string;
}

export interface Step {
  /** `clave` o `clave#integrante`. */
  id: string;
  question: EngineQuestion;
  instance: string;
  member: Member | null;
  label: string;
}

export const stepId = (key: string, instance: string) => (instance ? `${key}#${instance}` : key);

export function sortQuestions(questions: EngineQuestion[]): EngineQuestion[] {
  return [...questions].sort((a, b) => a.order - b.order);
}

const byRole = (questions: EngineQuestion[], role: QuestionRole) => questions.find((q) => q.meta?.role === role);
const repeatedKeys = (questions: EngineQuestion[]) => new Set(questions.filter((q) => q.meta?.repeat).map((q) => q.key));

function lookup(answers: AnswerMap, repeated: Set<string>, key: string, instance: string) {
  const id = instance && repeated.has(key) ? stepId(key, instance) : key;
  return { present: id in answers, value: answers[id] };
}

export function isConditionMet(
  condition: QuestionCondition | null | undefined,
  answers: AnswerMap,
  instance = '',
  repeated: Set<string> = new Set(),
): boolean {
  if (!condition) return true;
  const { present, value } = lookup(answers, repeated, condition.questionKey, instance);
  if (!present) return false;
  const primitive = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined;
  if (condition.equals !== undefined && primitive !== condition.equals) return false;
  if (condition.notEquals !== undefined && primitive === condition.notEquals) return false;
  if (condition.in !== undefined && (primitive === undefined || !condition.in.includes(primitive))) return false;
  if (condition.includes !== undefined && !(isMulti(value) && value.values.includes(condition.includes))) return false;
  if (condition.excludes !== undefined && isMulti(value) && value.values.includes(condition.excludes)) return false;
  if (condition.answered !== undefined && isConcrete(value) !== condition.answered) return false;
  return true;
}

/** Persona titular más integrantes adicionales declarados (según la cantidad informada). */
export function membersOf(questions: EngineQuestion[], answers: AnswerMap): Member[] {
  const first = byRole(questions, 'titular_first_name');
  const titularName = first && typeof answers[first.key] === 'string' ? (answers[first.key] as string) : 'Titular';
  const list: Member[] = [{ id: 'm0', index: 0, titular: true, name: titularName }];
  const countQ = byRole(questions, 'members_count');
  if (!countQ || !isConditionMet(countQ.condition, answers)) return list;
  const count = answers[countQ.key];
  if (typeof count !== 'number' || count < 1) return list;
  const nameQ = byRole(questions, 'member_name');
  for (let i = 1; i <= Math.min(count, 20); i++) {
    const id = `m${i}`;
    const name = nameQ ? answers[stepId(nameQ.key, id)] : undefined;
    list.push({ id, index: i, titular: false, name: typeof name === 'string' ? name : `Integrante ${i}` });
  }
  return list;
}

/** Edad declarada de una persona (null si no se conoce). */
export function memberAge(questions: EngineQuestion[], answers: AnswerMap, member: Member, today: Date): number | null {
  const q = member.titular ? byRole(questions, 'birth_date') : byRole(questions, 'member_birth_date');
  if (!q) return null;
  const v = answers[member.titular ? q.key : stepId(q.key, member.id)];
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? ageOn(v, today) : null;
}

export function renderLabel(q: EngineQuestion, member: Member | null): string {
  if (member?.titular && q.meta?.labelSelf) return q.meta.labelSelf;
  if (!member) return q.label;
  return q.label.replaceAll('{nombre}', member.name).replaceAll('{n}', String(member.index));
}

/** Pasos visibles según las respuestas actuales, en orden de conversación. */
export function expandSteps(questions: EngineQuestion[], answers: AnswerMap, today: Date = new Date()): Step[] {
  const sorted = sortQuestions(questions);
  const repeated = repeatedKeys(questions);
  const steps: Step[] = [];
  let i = 0;
  while (i < sorted.length) {
    const q = sorted[i]!;
    const repeat = q.meta?.repeat;
    if (!repeat) {
      if (isConditionMet(q.condition, answers, '', repeated)) {
        steps.push({ id: q.key, question: q, instance: '', member: null, label: q.label });
      }
      i++;
      continue;
    }
    // Bloque: preguntas consecutivas con la misma repetición y el mismo bloque.
    const block: EngineQuestion[] = [q];
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.meta?.repeat === repeat && sorted[j]!.meta?.block === q.meta?.block) {
      block.push(sorted[j]!);
      j++;
    }
    const people = membersOf(questions, answers).filter((m) => repeat === 'all_members' || !m.titular);
    for (const member of people) {
      for (const bq of block) {
        if (!isConditionMet(bq.condition, answers, member.id, repeated)) continue;
        const range = bq.meta?.memberAge;
        if (range) {
          const age = memberAge(questions, answers, member, today);
          if (age !== null && ((range.min !== undefined && age < range.min) || (range.max !== undefined && age > range.max))) continue;
        }
        steps.push({ id: stepId(bq.key, member.id), question: bq, instance: member.id, member, label: renderLabel(bq, member) });
      }
    }
    i = j;
  }
  return steps;
}

/** Primer paso visible sin responder; null si el cuestionario está terminado. */
export function nextStep(questions: EngineQuestion[], answers: AnswerMap, today?: Date): Step | null {
  return expandSteps(questions, answers, today).find((s) => !(s.id in answers)) ?? null;
}

/** Compatibilidad: preguntas de los pasos visibles. */
export function visibleQuestions(questions: EngineQuestion[], answers: AnswerMap): EngineQuestion[] {
  return expandSteps(questions, answers).map((s) => s.question);
}

/** Compatibilidad: pregunta del próximo paso. */
export function nextQuestion(questions: EngineQuestion[], answers: AnswerMap): EngineQuestion | null {
  return nextStep(questions, answers)?.question ?? null;
}

export function computeProgress(questions: EngineQuestion[], answers: AnswerMap, today?: Date): Progress {
  const steps = expandSteps(questions, answers, today);
  return { answered: steps.filter((s) => s.id in answers).length, total: steps.length };
}

export function canComplete(questions: EngineQuestion[], answers: AnswerMap, today?: Date): boolean {
  return nextStep(questions, answers, today) === null;
}

// ------------------------------------------------------------------ Validación

export interface Confirmation {
  message: string;
  candidates: { value: AnswerValue; label: string }[];
}

export type ValidationResult =
  | { ok: true; value: AnswerValue }
  | { ok: false; error: string }
  | ({ ok: 'confirm' } & Confirmation);

export interface ValidationContext {
  today?: Date;
  /** Provincia elegida (para localidades). */
  provinceId?: string;
  provinceName?: string;
  resolveLocality?: (provinceId: string, text: string) =>
    | { kind: 'exact'; locality: { id: string; name: string; province: string; provinceId: string; department: string } }
    | { kind: 'ambiguous'; candidates: { id: string; name: string; province: string; provinceId: string; department: string }[] }
    | { kind: 'none' };
  localityById?: (id: string) => { id: string; name: string; province: string; provinceId: string; department: string } | null;
}

const UNKNOWN_WORDS = ['no se', 'nose', 'no lo se', 'ns', 'no sabe', 'desconozco', 'no recuerdo', 'no me acuerdo'];
const PREFER_NOT_WORDS = ['prefiero no responder', 'prefiero no decir', 'prefiero no contestar', 'no quiero responder', 'pnr'];

function specialFrom(q: EngineQuestion, raw: unknown): SpecialAnswer | 'not_allowed' | null {
  const m = q.meta ?? {};
  if (isSpecial(raw)) {
    const allowed = raw.special === 'unknown' ? m.allowUnknown : m.allowPreferNot;
    return allowed ? { special: raw.special } : 'not_allowed';
  }
  if (typeof raw !== 'string') return null;
  const n = normalizeText(raw);
  if (m.allowUnknown && UNKNOWN_WORDS.includes(n)) return { special: 'unknown' };
  if (m.allowPreferNot && PREFER_NOT_WORDS.includes(n)) return { special: 'prefer_not' };
  return null;
}

function fromParsed<T extends AnswerValue>(p: Parsed<T>): ValidationResult {
  if (p.ok === 'confirm') return { ok: 'confirm', message: p.message, candidates: p.candidates };
  return p.ok ? { ok: true, value: p.value } : { ok: false, error: p.error };
}

function otherText(raw: OtherAnswer): string | null {
  const t = raw.other.trim();
  return t.length >= 2 && t.length <= 200 ? t : null;
}

/** Opción que coincide con lo escrito: valor exacto, etiqueta sin tildes o comienzo único de la etiqueta. */
function matchOption(options: ChoiceOption[], text: string): { exact?: ChoiceOption; close: ChoiceOption[] } {
  const byValue = options.find((o) => o.value === text);
  if (byValue) return { exact: byValue, close: [] };
  const n = normalizeText(text);
  if (!n) return { close: [] };
  const byLabel = options.find((o) => normalizeText(o.label) === n);
  if (byLabel) return { exact: byLabel, close: [] };
  const starts = options.filter((o) => n.length >= 3 && normalizeText(o.label).startsWith(n));
  if (starts.length === 1) return { exact: starts[0], close: [] };
  const close = options.filter((o) => {
    const l = normalizeText(o.label);
    return (n.length >= 3 && l.includes(n)) || similarity(n, l) >= 0.75;
  });
  return { close };
}

/** Valida y normaliza un valor según el tipo y las reglas de la pregunta. */
export function validateAnswer(question: EngineQuestion, raw: unknown, ctx: ValidationContext = {}): ValidationResult {
  const special = specialFrom(question, raw);
  if (special === 'not_allowed') return { ok: false, error: 'Esta pregunta no admite esa opción.' };
  if (special) return { ok: true, value: special };

  const empty =
    raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '') || (Array.isArray(raw) && raw.length === 0);
  if (empty) {
    return question.required ? { ok: false, error: 'Esta pregunta es obligatoria.' } : { ok: true, value: null };
  }
  const v = question.validation ?? {};
  const meta = question.meta ?? {};
  const today = ctx.today ?? new Date();

  if (isOther(raw)) {
    if (!meta.otherLabel || !['single_choice', 'dni', 'locality', 'text'].includes(question.type)) {
      return { ok: false, error: 'Esta pregunta no admite "Otro".' };
    }
    const text = otherText(raw);
    if (!text) return { ok: false, error: 'Contanos cuál (entre 2 y 200 caracteres).' };
    if (question.type === 'locality') {
      return {
        ok: true,
        value: { id: null, name: text, province: ctx.provinceName ?? '', provinceId: ctx.provinceId ?? '', verified: false },
      };
    }
    return { ok: true, value: { other: text } };
  }

  switch (question.type) {
    case 'text': {
      if (typeof raw !== 'string') return { ok: false, error: 'Se esperaba un texto.' };
      const value = raw.trim();
      const min = v.minLength ?? 1;
      const max = v.maxLength ?? 500;
      if (value.length < min) return { ok: false, error: `Ingresá al menos ${min} caracteres.` };
      if (value.length > max) return { ok: false, error: `Máximo ${max} caracteres.` };
      if (v.pattern && !new RegExp(v.pattern, 'i').test(value)) {
        return { ok: false, error: v.patternMessage ?? 'Revisá el formato.' };
      }
      return { ok: true, value: v.pattern ? value.toUpperCase() : value };
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
      const text = String(raw).trim();
      const { exact, close } = matchOption(options, text);
      if (exact) return { ok: true, value: exact.value };
      const candidates: Confirmation['candidates'] = close.slice(0, 3).map((o) => ({ value: o.value, label: o.label }));
      if (meta.otherLabel && text.length >= 2) candidates.push({ value: { other: text.slice(0, 200) }, label: `${meta.otherLabel}: ${text.slice(0, 60)}` });
      if (candidates.length) return { ok: 'confirm', message: '¿Te referís a alguna de estas opciones?', candidates };
      return { ok: false, error: 'Elegí una de las opciones disponibles.' };
    }
    case 'multi_choice':
      return validateMulti(question, raw);
    case 'yes_no': {
      let value: boolean | null = null;
      if (typeof raw === 'boolean') value = raw;
      else {
        const s = normalizeText(String(raw));
        if (['si', 'true', 'yes', 's'].includes(s)) value = true;
        else if (['no', 'false', 'n'].includes(s)) value = false;
      }
      if (value === null) return { ok: false, error: 'Respondé "Sí" o "No".' };
      if (v.mustBeTrue && !value) {
        return { ok: false, error: v.mustBeTrueMessage ?? 'Para continuar necesitamos tu confirmación.' };
      }
      return { ok: true, value };
    }
    case 'date':
      return fromParsed(parseDate(String(raw), v.dateRule ?? 'any', today));
    case 'dni':
      return fromParsed(parseDni(String(raw)));
    case 'phone':
      return fromParsed(parsePhone(String(raw)));
    case 'email':
      return fromParsed(parseEmail(String(raw)));
    case 'locality':
      return validateLocality(question, raw, ctx);
    default:
      return { ok: false, error: 'Tipo de pregunta no soportado.' };
  }
}

function validateMulti(question: EngineQuestion, raw: unknown): ValidationResult {
  const options = question.options ?? [];
  let values: string[] = [];
  let other: string | undefined;
  const unresolved: string[] = [];

  if (Array.isArray(raw)) values = raw.map(String);
  else if (isMulti(raw)) {
    values = raw.values.map(String);
    other = raw.other?.trim() || undefined;
  } else if (typeof raw === 'string') {
    for (const token of raw.split(/[,;\n]|\s+y\s+/i).map((t) => t.trim()).filter(Boolean)) {
      if (/^\d{1,2}$/.test(token) && options[Number(token) - 1]) {
        values.push(options[Number(token) - 1]!.value);
        continue;
      }
      const { exact } = matchOption(options, token);
      if (exact) values.push(exact.value);
      else unresolved.push(token);
    }
  } else return { ok: false, error: 'Elegí una o más opciones.' };

  values = [...new Set(values)];
  const unknownValue = values.find((x) => !options.some((o) => o.value === x));
  if (unknownValue) return { ok: false, error: 'Elegí opciones de la lista.' };
  const hasOther = options.some((o) => o.value === 'other');
  if (unresolved.length) {
    if (!hasOther) return { ok: false, error: `No reconocimos "${unresolved.join(', ')}". Elegí opciones de la lista.` };
    const text = unresolved.join(', ').slice(0, 200);
    const proposal: MultiAnswer = { values: order(options, [...new Set([...values, 'other'])]), other: text };
    return {
      ok: 'confirm',
      message: `¿Registramos "${text}" como "Otro"?`,
      candidates: [{ value: proposal, label: 'Sí, registrarlo' }],
    };
  }
  if (!values.length) return question.required ? { ok: false, error: 'Elegí al menos una opción.' } : { ok: true, value: null };
  const exclusive = options.filter((o) => o.exclusive && values.includes(o.value));
  if (exclusive.length && values.length > 1) {
    return { ok: false, error: `"${exclusive[0]!.label}" no se puede combinar con otras opciones.` };
  }
  if (values.includes('other') && !other) return { ok: false, error: 'Contanos cuál en "Otro".' };
  if (other && other.length > 200) return { ok: false, error: '"Otro": máximo 200 caracteres.' };
  return { ok: true, value: { values: order(options, values), ...(values.includes('other') ? { other } : {}) } };
}

const order = (options: ChoiceOption[], values: string[]) =>
  options.map((o) => o.value).filter((x) => values.includes(x));

function validateLocality(question: EngineQuestion, raw: unknown, ctx: ValidationContext): ValidationResult {
  if (!ctx.provinceId || !ctx.resolveLocality || !ctx.localityById) return { ok: false, error: 'Primero elegí la provincia.' };
  const province = ctx.provinceName ?? '';
  if (isObj(raw) && typeof raw.localityId === 'string') {
    const l = ctx.localityById(raw.localityId);
    if (!l || l.provinceId !== ctx.provinceId) return { ok: false, error: 'Elegí una localidad de la provincia indicada.' };
    return { ok: true, value: { ...l, verified: true } };
  }
  if (typeof raw !== 'string') return { ok: false, error: 'Escribí el nombre de la localidad.' };
  const text = raw.trim().slice(0, 120);
  const r = ctx.resolveLocality(ctx.provinceId, text);
  const unverified: LocalityAnswer = { id: null, name: text, province, provinceId: ctx.provinceId, verified: false };
  const label = (l: { name: string; department: string }) => (l.department && l.department !== l.name ? `${l.name} (${l.department})` : l.name);
  if (r.kind === 'exact') return { ok: true, value: { ...r.locality, verified: true } };
  if (r.kind === 'ambiguous') {
    const candidates: Confirmation['candidates'] = r.candidates.map((l) => ({ value: { ...l, verified: true }, label: label(l) }));
    if (question.meta?.otherLabel) candidates.push({ value: unverified, label: `Ninguna: registrar "${text}" para verificar` });
    return { ok: 'confirm', message: '¿Cuál de estas localidades es la tuya?', candidates };
  }
  if (question.meta?.otherLabel) {
    return {
      ok: 'confirm',
      message: `No encontramos "${text}" en ${province}. ¿La registramos igual para que la verifique un asesor?`,
      candidates: [{ value: unverified, label: 'Sí, registrarla para verificar' }],
    };
  }
  return { ok: false, error: `No encontramos esa localidad en ${province}. Revisá cómo está escrita.` };
}

// ------------------------------------------------------------------ Presentación

/** Texto legible de una respuesta (para chat, ficha, resumen y PDF). */
export function formatAnswer(question: EngineQuestion, value: AnswerValue | undefined): string {
  if (value === null || value === undefined) return 'Sin respuesta';
  if (isSpecial(value)) return SPECIAL_LABEL[value.special];
  if (isLocality(value)) {
    const where = value.province && !value.name.includes(value.province) ? `${value.name}, ${value.province}` : value.name;
    return value.verified ? where : `${where} (a verificar)`;
  }
  if (isOther(value)) return `${question.meta?.otherLabel ?? 'Otro'}: ${value.other}`;
  if (isMulti(value)) {
    const labels = value.values.map((x) =>
      x === 'other' && value.other ? `Otro: ${value.other}` : question.options?.find((o) => o.value === x)?.label ?? x,
    );
    return labels.join(', ');
  }
  switch (question.type) {
    case 'yes_no':
      return value ? 'Sí' : 'No';
    case 'single_choice':
      return question.options?.find((o) => o.value === value)?.label ?? String(value);
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : String(value);
    case 'dni':
      return typeof value === 'string' ? formatDni(value) : String(value);
    case 'phone':
      return typeof value === 'string' ? formatPhone(value) : String(value);
    default:
      return String(value);
  }
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
    const n = sorted.indexOf(q) + 1;
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(q.key)) {
      errors.push(`Clave inválida "${q.key}": usar minúsculas, números y guion bajo.`);
    }
    if (seen.has(q.key)) errors.push(`Clave duplicada "${q.key}".`);
    if (!q.label.trim()) errors.push(`La pregunta ${n} no tiene texto.`);
    if ((q.shortLabel ?? '').length > 60) errors.push(`La etiqueta de la pregunta ${n} supera 60 caracteres.`);
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      const opts = q.options ?? [];
      if (opts.length < 2) errors.push(`"${q.key}" necesita al menos 2 opciones.`);
      const values = new Set(opts.map((o) => o.value));
      if (values.size !== opts.length) errors.push(`"${q.key}" tiene opciones duplicadas.`);
    }
    if (q.meta?.repeat && !sorted.some((o) => o.meta?.role === 'members_count' && o.order < q.order) && q.meta.repeat === 'additional_members') {
      errors.push(`"${q.key}" se repite por integrante, pero no hay una pregunta previa de cantidad de integrantes.`);
    }
    if (q.type === 'locality') {
      const p = q.meta?.provinceKey ? seen.get(q.meta.provinceKey) : undefined;
      if (!p) errors.push(`"${q.key}" necesita una pregunta de provincia anterior.`);
    }
    if (q.condition) {
      const ref = seen.get(q.condition.questionKey);
      if (!ref) {
        errors.push(`"${q.key}" depende de "${q.condition.questionKey}", que debe existir y estar antes.`);
      } else {
        const c = q.condition;
        const expected = [c.equals, c.notEquals, ...(c.in ?? [])].filter((x) => x !== undefined);
        const multiRefs = [c.includes, c.excludes].filter((x) => x !== undefined);
        if (expected.length === 0 && multiRefs.length === 0 && c.answered === undefined) {
          errors.push(`La condición de "${q.key}" no define un valor.`);
        }
        if (ref.meta?.repeat && !q.meta?.repeat) {
          errors.push(`"${q.key}" depende de una pregunta por integrante pero no se repite por integrante.`);
        }
        if (ref.type === 'single_choice') {
          const valid = new Set((ref.options ?? []).map((o) => o.value));
          for (const e of expected) {
            if (!valid.has(String(e))) errors.push(`La condición de "${q.key}" usa la opción inexistente "${e}".`);
          }
        }
        if (ref.type === 'multi_choice') {
          const valid = new Set((ref.options ?? []).map((o) => o.value));
          for (const e of multiRefs) {
            if (!valid.has(String(e))) errors.push(`La condición de "${q.key}" usa la opción inexistente "${e}".`);
          }
        } else if (multiRefs.length) {
          errors.push(`La condición de "${q.key}" usa "incluye" sobre una pregunta que no es de selección múltiple.`);
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
  const clean = q.label.replace(/\([^)]*\)/g, '').replace(/\{[^}]*\}/g, '').replace(/[¿?¡!]/g, '').replace(/\s+/g, ' ').trim();
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
 * Perfil comercial determinístico construido sólo con respuestas presentes de la persona titular y
 * el domicilio (las declaraciones por integrante, incluidas las de salud, no forman parte del perfil).
 * No infiere datos ausentes y omite el "Sí" que sólo habilita otra pregunta ya respondida.
 */
export function buildProfile(questions: EngineQuestion[], answers: AnswerMap): ProfileField[] {
  const fields: ProfileField[] = [];
  const steps = expandSteps(questions, answers).filter((s) => !s.instance);
  for (const { question: q, id } of steps) {
    if (!(id in answers)) continue;
    const value = answers[id];
    if (value === null || value === undefined) continue;
    if (q.meta?.role === 'review' || q.meta?.role === 'consent') continue;
    const isGate = q.type === 'yes_no' && questions.some((o) => o.condition?.questionKey === q.key);
    const gatedAnswered = steps.some((o) => o.question.condition?.questionKey === q.key && isConcrete(answers[o.id]));
    if (isGate && (value === false || gatedAnswered)) continue;
    const display = formatAnswer(q, value);
    fields.push({ key: id, label: profileLabel(q), value: display, type: q.type, long: q.type === 'text' && display.length > 40 });
  }
  return fields;
}

/** Resumen en líneas "Etiqueta: valor" (derivado del perfil). */
export function buildSummary(questions: EngineQuestion[], answers: AnswerMap): string[] {
  return buildProfile(questions, answers).map((f) => `${f.label}: ${f.value}`);
}
