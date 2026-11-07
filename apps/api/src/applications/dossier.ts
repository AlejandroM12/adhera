/**
 * Ficha de preentrevista: agrupa la declaración por sección y por persona, con el texto original,
 * las confirmaciones, las correcciones del interesado y las observaciones del asesor.
 *
 * La revisión sólo marca datos faltantes ("No sé" / "Prefiero no responder"), datos a verificar y
 * contradicciones EXPLÍCITAS entre datos declarados (fechas, documentos). No interpreta clínicamente,
 * no puntúa, no clasifica por costo y no infiere información no declarada.
 */
import {
  AnswerMap, AnswerValue, EngineQuestion, expandSteps, formatAnswer, isLocality, isOther, isSpecial, Member, membersOf,
  memberAge, profileLabel, Step,
} from '../engine/conversation-engine';
import { formatDate } from '../engine/validators';

export interface AnswerRow {
  questionId: string;
  instance: string;
  valueJson: unknown;
  rawText: string | null;
  confirmationJson: unknown;
  createdAt: Date;
  revisions: { previousValueJson: unknown; previousRawText: string | null; createdAt: Date }[];
}

export interface ObservationNote {
  id: string;
  kind: 'NOTE' | 'OBSERVATION' | 'CLARIFICATION';
  questionKey: string | null;
  content: string;
  createdAt: Date;
  resolvedAt: Date | null;
  author: { id: string; displayName: string };
}

export interface DossierItem {
  stepId: string;
  key: string;
  label: string;
  question: string;
  answer: string;
  /** Texto escrito por el interesado, si difiere de la respuesta normalizada. */
  original: string | null;
  status: 'answered' | 'unknown' | 'prefer_not' | 'skipped' | 'to_verify';
  confirmed: { message: string; chosen: string } | null;
  corrections: { previous: string; previousOriginal: string | null; at: Date }[];
  observations: ObservationNote[];
  answeredAt: Date;
}

export interface DossierSection {
  title: string;
  items: DossierItem[];
}

export interface DossierMember {
  id: string;
  titular: boolean;
  name: string;
  relation: string | null;
  dni: string | null;
  birthDate: string | null;
  age: number | null;
  /** Datos personales del integrante (para titular, los de la sección de identificación). */
  data: DossierItem[];
  /** Declaraciones de salud de esta persona, por sección. */
  health: DossierSection[];
}

export interface ReviewFlag {
  stepId: string | null;
  memberId: string | null;
  section: string | null;
  label: string;
  detail: string;
}

export interface Dossier {
  templateKey: string | null;
  title: string | null;
  general: DossierSection[];
  members: DossierMember[];
  review: { missing: ReviewFlag[]; contradictions: ReviewFlag[]; clarifications: ReviewFlag[] };
  counts: { answered: number; missing: number; toVerify: number };
}

const textOf = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v));

function statusOf(value: AnswerValue): DossierItem['status'] {
  if (value === null) return 'skipped';
  if (isSpecial(value)) return value.special === 'unknown' ? 'unknown' : 'prefer_not';
  if ((isLocality(value) && !value.verified) || isOther(value)) return 'to_verify';
  return 'answered';
}

function itemFor(step: Step, answers: AnswerMap, row: AnswerRow | undefined, notes: ObservationNote[]): DossierItem {
  const value = (answers[step.id] ?? null) as AnswerValue;
  // La marca "a verificar" / "omitida" se muestra como estado, no dentro del texto.
  const answer = value === null ? '—' : formatAnswer(step.question, value).replace(/ \(a verificar\)$/, '');
  const raw = row?.rawText ?? null;
  const conf = row?.confirmationJson as { message?: string; offered?: string[]; chosen?: number } | null;
  return {
    stepId: step.id,
    key: step.question.key,
    label: profileLabel(step.question),
    question: step.label,
    answer,
    // Sólo si el interesado escribió algo distinto de lo guardado (ej. "rio cuatro" → Río Cuarto).
    original: raw && raw !== answer && raw !== textOf(value) && !raw.startsWith('{') && !raw.startsWith('[') ? raw : null,
    status: statusOf(value),
    confirmed:
      conf && typeof conf.chosen === 'number' && conf.offered
        ? { message: conf.message ?? '', chosen: conf.offered[conf.chosen] ?? '' }
        : null,
    corrections: (row?.revisions ?? []).map((r) => ({
      previous: formatAnswer(step.question, (r.previousValueJson ?? null) as AnswerValue),
      previousOriginal: textOf(r.previousRawText),
      at: r.createdAt,
    })),
    observations: notes.filter((n) => n.questionKey === step.id),
    answeredAt: row?.createdAt ?? new Date(0),
  };
}

function groupBySection(items: { item: DossierItem; section: string }[]): DossierSection[] {
  const out: DossierSection[] = [];
  for (const { item, section } of items) {
    const last = out[out.length - 1];
    if (last && last.title === section) last.items.push(item);
    else out.push({ title: section, items: [item] });
  }
  return out;
}

export function buildDossier(input: {
  questions: EngineQuestion[];
  rows: AnswerRow[];
  answers: AnswerMap;
  notes: ObservationNote[];
  version: { title: string | null; templateKey: string | null };
  today?: Date;
}): Dossier {
  const { questions, rows, answers, notes } = input;
  const today = input.today ?? new Date();
  const steps = expandSteps(questions, answers, today).filter((s) => s.id in answers);
  const rowFor = (s: Step) => rows.find((r) => r.questionId === s.question.id && r.instance === s.instance);
  const items = steps.map((s) => ({ step: s, item: itemFor(s, answers, rowFor(s), notes) }));
  const role = (s: Step) => s.question.meta?.role;
  const sectionOf = (s: Step) => s.question.meta?.section ?? 'Respuestas';

  // Secciones generales (sin integrante), sin la revisión/consentimiento (se muestran aparte).
  const general = groupBySection(
    items.filter(({ step }) => !step.instance && role(step) !== 'review' && role(step) !== 'consent')
      .map(({ step, item }) => ({ item, section: sectionOf(step) })),
  );

  const people = steps.some((s) => s.instance) ? membersOf(questions, answers) : [];
  const valueOf = (m: Member, r: string) => {
    const q = questions.find((x) => x.meta?.role === r);
    if (!q) return undefined;
    return answers[m.titular ? q.key : `${q.key}#${m.id}`];
  };
  const members: DossierMember[] = people.map((m) => {
    const own = items.filter(({ step }) => step.instance === m.id);
    const dataItems = own.filter(({ step }) => step.question.meta?.repeat === 'additional_members').map(({ item }) => item);
    const relation = m.titular ? 'Titular' : (dataItems.find((i) => i.key === 'member_relation')?.answer ?? null);
    const birth = valueOf(m, m.titular ? 'birth_date' : 'member_birth_date');
    const dni = valueOf(m, m.titular ? 'titular_dni' : 'member_dni');
    return {
      id: m.id,
      titular: m.titular,
      name: m.titular
        ? [answers.first_name, answers.last_name].filter((x) => typeof x === 'string').join(' ') || m.name
        : m.name,
      relation,
      dni: typeof dni === 'string' ? dni : null,
      birthDate: typeof birth === 'string' ? formatDate(birth) : null,
      age: memberAge(questions, answers, m, today),
      data: dataItems,
      health: groupBySection(
        own.filter(({ step }) => step.question.meta?.repeat === 'all_members').map(({ step, item }) => ({ item, section: sectionOf(step) })),
      ),
    };
  });

  // ---- Revisión
  const missing: ReviewFlag[] = [];
  const clarifications: ReviewFlag[] = [];
  const flag = (step: Step, item: DossierItem, detail: string): ReviewFlag => ({
    stepId: step.id,
    memberId: step.instance || null,
    section: sectionOf(step),
    label: step.member ? `${item.label} · ${step.member.titular ? `${step.member.name} (titular)` : step.member.name}` : item.label,
    detail,
  });
  for (const { step, item } of items) {
    if (item.status === 'unknown' || item.status === 'prefer_not') {
      missing.push(flag(step, item, item.status === 'unknown' ? 'Respondió "No sé"' : 'Prefirió no responder'));
    }
    if (item.status === 'to_verify') clarifications.push(flag(step, item, `A verificar: ${item.answer}`));
  }
  for (const n of notes) {
    if (n.kind !== 'CLARIFICATION' || n.resolvedAt) continue;
    const it = items.find(({ step }) => step.id === n.questionKey);
    clarifications.push({
      stepId: n.questionKey,
      memberId: it?.step.instance || null,
      section: it ? sectionOf(it.step) : null,
      label: it ? it.item.label : 'Aclaración general',
      detail: `Pendiente (asesor): ${n.content}`,
    });
  }

  const contradictions: ReviewFlag[] = [];
  const titular = members.find((m) => m.titular);
  const isoBirth = (m: DossierMember) => {
    const v = valueOf({ id: m.id, titular: m.titular, index: 0, name: m.name }, m.titular ? 'birth_date' : 'member_birth_date');
    return typeof v === 'string' ? v : null;
  };
  const titularBirth = titular ? isoBirth(titular) : null;
  for (const m of members.filter((x) => !x.titular)) {
    const relation = answers[`member_relation#${m.id}`];
    const birth = isoBirth(m);
    if (titularBirth && birth && relation === 'child' && birth <= titularBirth) {
      contradictions.push({
        stepId: `member_birth_date#${m.id}`, memberId: m.id, section: 'Cobertura y grupo familiar',
        label: `Fecha de nacimiento · ${m.name}`,
        detail: `Declarado como hijo/a, pero su fecha de nacimiento (${formatDate(birth)}) es anterior o igual a la de la persona titular (${formatDate(titularBirth)}).`,
      });
    }
    if (titularBirth && birth && relation === 'parent' && birth >= titularBirth) {
      contradictions.push({
        stepId: `member_birth_date#${m.id}`, memberId: m.id, section: 'Cobertura y grupo familiar',
        label: `Fecha de nacimiento · ${m.name}`,
        detail: `Declarado como padre o madre, pero su fecha de nacimiento (${formatDate(birth)}) es posterior o igual a la de la persona titular.`,
      });
    }
  }
  const dnis = members.filter((m) => m.dni).map((m) => ({ m, dni: m.dni! }));
  for (const [i, a] of dnis.entries()) {
    const dup = dnis.slice(i + 1).find((b) => b.dni === a.dni);
    if (dup) {
      contradictions.push({
        stepId: null, memberId: dup.m.id, section: 'Cobertura y grupo familiar', label: 'DNI repetido',
        detail: `${a.m.name} y ${dup.m.name} tienen el mismo DNI declarado.`,
      });
    }
  }
  for (const m of members) {
    const weeks = answers[`h_preg_weeks#${m.id}`];
    const due = answers[`h_preg_due#${m.id}`];
    if (typeof weeks === 'number' && typeof due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due)) {
      const expected = today.getTime() + (40 - weeks) * 7 * 864e5;
      const diffWeeks = Math.round(Math.abs(Date.parse(`${due}T00:00:00Z`) - expected) / (7 * 864e5));
      if (diffWeeks > 4) {
        contradictions.push({
          stepId: `h_preg_due#${m.id}`, memberId: m.id, section: 'Embarazo y controles',
          label: `Embarazo · ${m.name}`,
          detail: `Las semanas declaradas (${weeks}) y la fecha probable de parto (${formatDate(due)}) no coinciden (diferencia de unas ${diffWeeks} semanas). Verificar con la persona.`,
        });
      }
    }
  }

  return {
    templateKey: input.version.templateKey,
    title: input.version.title,
    general,
    members,
    review: { missing, contradictions, clarifications },
    counts: {
      answered: items.filter(({ item }) => item.status === 'answered').length,
      missing: missing.length,
      toVerify: items.filter(({ item }) => item.status === 'to_verify').length,
    },
  };
}
