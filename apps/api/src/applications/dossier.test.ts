import { describe, expect, it } from 'vitest';
import { buildDossier, AnswerRow, ObservationNote } from './dossier';
import { AnswerMap, EngineQuestion, expandSteps } from '../engine/conversation-engine';
import { healthV2Questions } from '../questionnaires/templates/health-v2';
import { healthV2Examples } from '../questionnaires/templates/health-v2.examples';

const TODAY = new Date(Date.UTC(2026, 10, 7));
const QS: EngineQuestion[] = healthV2Questions().map((q, i) => ({ ...q, id: `q${i}` }));
const byKey = new Map(QS.map((q) => [q.key, q]));

function rowsFor(answers: AnswerMap, extra: Partial<Record<string, Partial<AnswerRow>>> = {}): AnswerRow[] {
  return expandSteps(QS, answers, TODAY).map((s) => ({
    questionId: byKey.get(s.question.key)!.id,
    instance: s.instance,
    valueJson: answers[s.id] ?? null,
    rawText: typeof answers[s.id] === 'string' ? (answers[s.id] as string) : null,
    confirmationJson: null,
    createdAt: TODAY,
    revisions: [],
    ...extra[s.id],
  }));
}

const build = (answers: AnswerMap, notes: ObservationNote[] = [], extra = {}) =>
  buildDossier({ questions: QS, rows: rowsFor(answers, extra), answers, notes, version: { title: 'Preentrevista de salud', templateKey: 'health-v2' }, today: TODAY });

const examples = healthV2Examples(TODAY);

describe('Ficha de preentrevista', () => {
  it('separa secciones generales y la declaración de salud de cada integrante', () => {
    const d = build(examples[1]!.answers);
    expect(d.general.map((s) => s.title)).toEqual(['Identificación y contacto', 'Domicilio', 'Cobertura y grupo familiar']);
    expect(d.members.map((m) => [m.name, m.relation])).toEqual([
      ['Gustavo Ferreyra', 'Titular'], ['Lucía Ferreyra', 'Pareja conviviente'], ['Tomás Ferreyra', 'Hijo/a'],
    ]);
    const lucia = d.members[1]!;
    expect(lucia.data.map((i) => i.key)).toContain('member_dni');
    expect(lucia.health.map((s) => s.title)).toContain('Embarazo y controles');
    // La salud de una persona no aparece en la de otra.
    const tomas = d.members[2]!;
    expect(tomas.health.flatMap((s) => s.items).every((i) => i.stepId.endsWith('#m2'))).toBe(true);
    expect(tomas.health.flatMap((s) => s.items).some((i) => i.key === 'h_pregnancy')).toBe(false);
    // Revisión y consentimiento no se listan como secciones de la ficha.
    expect(d.general.flatMap((s) => s.items).some((i) => i.key === 'consent')).toBe(false);
  });

  it('marca "No sé"/"Prefiero no responder" como faltantes y lo no verificado como aclaración, sin contradicciones falsas', () => {
    const d = build(examples[1]!.answers);
    expect(d.review.missing.map((f) => f.label)).toEqual(['Derivar aportes', 'Antecedentes familiares · Tomás Ferreyra']);
    expect(d.review.contradictions).toEqual([]);
    const d3 = build(examples[2]!.answers);
    expect(d3.review.clarifications.map((f) => f.label)).toEqual(['Localidad', 'Situación laboral']);
    expect(d3.review.missing.some((f) => f.detail === 'Prefirió no responder')).toBe(true);
  });

  it('detecta contradicciones explícitas entre datos declarados', () => {
    // Ejemplo 3: hija con fecha de nacimiento anterior a la titular.
    const d3 = build(examples[2]!.answers);
    expect(d3.review.contradictions[0]!.detail).toMatch(/Declarado como hijo\/a/);
    // DNI repetido y semanas de embarazo incoherentes con la fecha probable de parto.
    const a = { ...examples[1]!.answers, 'member_dni#m2': '32456789', 'h_preg_due#m1': '2027-08-01' };
    const d = build(a);
    expect(d.review.contradictions.map((c) => c.label)).toEqual(['DNI repetido', 'Embarazo · Lucía Ferreyra']);
  });

  it('muestra texto original, confirmaciones, correcciones y observaciones sin modificar la respuesta', () => {
    const ex = examples[0]!;
    const notes: ObservationNote[] = [
      { id: 'n1', kind: 'CLARIFICATION', questionKey: 'h_meds_detail#m0', content: 'Pedir nombre comercial', createdAt: TODAY, resolvedAt: null, author: { id: 'u', displayName: 'Asesor' } },
      { id: 'n2', kind: 'CLARIFICATION', questionKey: 'phone', content: 'Ya resuelta', createdAt: TODAY, resolvedAt: TODAY, author: { id: 'u', displayName: 'Asesor' } },
    ];
    const d = build(ex.answers, notes, {
      phone: { rawText: '351 555-0101', revisions: [{ previousValueJson: '+5493515550110', previousRawText: '351 555-0110', createdAt: TODAY }] },
      email: { confirmationJson: { message: '¿Quisiste…?', offered: ['a@gmail.com', 'b'], chosen: 0 } },
    });
    const items = d.general.flatMap((s) => s.items);
    const phone = items.find((i) => i.key === 'phone')!;
    expect(phone.original).toBe('351 555-0101');
    expect(phone.corrections[0]!.previousOriginal).toBe('351 555-0110');
    expect(items.find((i) => i.key === 'email')!.confirmed).toEqual({ message: '¿Quisiste…?', chosen: 'a@gmail.com' });
    const meds = d.members[0]!.health.flatMap((s) => s.items).find((i) => i.key === 'h_meds_detail')!;
    expect(meds.answer).toContain('tiroides');
    expect(meds.observations).toHaveLength(1);
    // Sólo las aclaraciones abiertas cuentan como pendientes.
    expect(d.review.clarifications.map((c) => c.detail)).toEqual(['Pendiente (asesor): Pedir nombre comercial']);
  });
});
