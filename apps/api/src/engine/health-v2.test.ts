import { describe, expect, it } from 'vitest';
import {
  AnswerMap, canComplete, EngineQuestion, expandSteps, formatAnswer, membersOf, nextStep, validateAnswer,
  validateQuestionnaireDefinition, ValidationContext,
} from './conversation-engine';
import { healthV2Questions } from '../questionnaires/templates/health-v2';
import { localityById, provinceById, resolveLocality, searchLocalities } from '../catalog/localities';
import { parseDate, parseDni, parseEmail, parsePhone } from './validators';

const TODAY = new Date(Date.UTC(2026, 10, 7));
const QS: EngineQuestion[] = healthV2Questions().map((q, i) => ({ ...q, id: `q${i}` }));
const Q = (key: string) => QS.find((q) => q.key === key)!;
const ids = (answers: AnswerMap) => expandSteps(QS, answers, TODAY).map((s) => s.id);

/** Titular sola, respuestas mínimas hasta la sección de salud. */
const base: AnswerMap = {
  first_name: 'Ana', last_name: 'Prueba', dni: '30123456', birth_date: '1990-04-10', sex_id: 'M',
  phone: '+5491123456789', email: null, contact_channel: 'whatsapp', contact_time: 'morning',
  province: '06', locality: { id: '060280010', name: 'X', province: 'Buenos Aires', provinceId: '06', verified: true },
  street: 'Calle Falsa 123', apartment: null, postal_code: null, current_coverage: 'none',
  work_status: 'retired', plan_type: 'individual',
};

const group: AnswerMap = {
  ...base, plan_type: 'group', members_count: 2,
  'member_relation#m1': 'spouse', 'member_name#m1': 'Luis Prueba', 'member_dni#m1': '31111111',
  'member_birth_date#m1': '1950-01-01', 'member_sex#m1': 'F',
  'member_relation#m2': 'child', 'member_name#m2': 'Sol Prueba', 'member_dni#m2': '55111111',
  'member_birth_date#m2': '2020-05-05', 'member_sex#m2': 'F',
};

describe('Preentrevista v2 — estructura', () => {
  it('la plantilla es válida', () => {
    expect(validateQuestionnaireDefinition(QS)).toEqual([]);
  });

  it('titular sola: salud de la titular en segunda persona y sin integrantes', () => {
    const steps = expandSteps(QS, base, TODAY);
    expect(steps.some((s) => s.question.key === 'member_name')).toBe(false);
    const history = steps.find((s) => s.question.key === 'h_history')!;
    expect(history.id).toBe('h_history#m0');
    expect(history.label).toMatch(/^Ahora unas preguntas de salud sobre vos/);
    expect(nextStep(QS, base, TODAY)!.id).toBe('h_history#m0');
  });

  it('embarazo: se pregunta según la edad declarada (10 a 60), no según el sexo del DNI', () => {
    // Titular con "M" en el DNI y 36 años: se pregunta igual (con la opción "No corresponde").
    expect(ids(base)).toContain('h_pregnancy#m0');
    const list = ids(group);
    expect(list).not.toContain('h_pregnancy#m1'); // 76 años
    expect(list).not.toContain('h_pregnancy#m2'); // 6 años
    expect(list).toContain('h_pregnancy#m0');
  });

  it('grupo: datos de cada integrante completos antes del siguiente y salud separada por persona', () => {
    const partial: AnswerMap = { ...base, plan_type: 'group', members_count: 2 };
    const list = ids(partial);
    const i = (id: string) => list.indexOf(id);
    expect(i('member_relation#m1')).toBeLessThan(i('member_sex#m1'));
    expect(i('member_sex#m1')).toBeLessThan(i('member_relation#m2'));
    expect(i('h_pending#m0')).toBeLessThan(i('h_history#m1'));
    expect(i('h_pending#m1')).toBeLessThan(i('h_history#m2'));
    expect(i('h_history#m2')).toBeLessThan(i('review_ok'));
    const named = expandSteps(QS, group, TODAY);
    expect(named.find((s) => s.id === 'h_history#m1')!.label).toBe('¿Luis Prueba tiene antecedentes médicos que quiera declarar?');
    expect(membersOf(QS, group).map((m) => m.name)).toEqual(['Ana', 'Luis Prueba', 'Sol Prueba']);
  });

  it('"No sé" y "Prefiero no responder" son respuestas válidas y no abren el detalle', () => {
    expect(validateAnswer(Q('h_chronic'), 'No sé')).toEqual({ ok: true, value: { special: 'unknown' } });
    expect(validateAnswer(Q('h_chronic'), { special: 'prefer_not' })).toEqual({ ok: true, value: { special: 'prefer_not' } });
    const a: AnswerMap = { ...base, 'h_history#m0': false, 'h_chronic#m0': { special: 'unknown' } };
    expect(ids(a)).not.toContain('h_chronic_detail#m0');
    expect(formatAnswer(Q('h_chronic'), { special: 'unknown' })).toBe('No sé');
    // Una pregunta que no ofrece esas opciones no las acepta.
    expect(validateAnswer(Q('first_name'), { special: 'unknown' }).ok).toBe(false);
  });

  it('completa una titular sin antecedentes y exige revisión y consentimiento', () => {
    const a: AnswerMap = { ...base };
    for (const k of ['h_history', 'h_chronic', 'h_hospital', 'h_surgery', 'h_meds', 'h_pending']) a[`${k}#m0`] = false;
    a['h_treatments#m0'] = { values: ['none'] };
    a['h_pregnancy#m0'] = 'na';
    a['h_family#m0'] = { values: ['none'] };
    expect(nextStep(QS, a, TODAY)!.id).toBe('review_ok');
    expect(validateAnswer(Q('review_ok'), false).ok).toBe(false);
    a.review_ok = true;
    expect(canComplete(QS, a, TODAY)).toBe(false);
    a.consent = true;
    expect(canComplete(QS, a, TODAY)).toBe(true);
  });
});

describe('Preentrevista v2 — selección múltiple y "Otro"', () => {
  it('acepta lista, números o etiquetas escritas, y respeta las opciones excluyentes', () => {
    const q = Q('h_treatments');
    expect(validateAnswer(q, ['psy', 'rehab'])).toEqual({ ok: true, value: { values: ['rehab', 'psy'] } });
    expect(validateAnswer(q, '2, 3')).toEqual({ ok: true, value: { values: ['rehab', 'psy'] } });
    expect(validateAnswer(q, 'diálisis')).toEqual({ ok: true, value: { values: ['dialysis'] } });
    expect(validateAnswer(q, ['none', 'psy']).ok).toBe(false);
    expect(validateAnswer(q, { values: ['other'] }).ok).toBe(false);
    expect(validateAnswer(q, { values: ['other'], other: 'Fonoaudiología' })).toEqual({
      ok: true, value: { values: ['other'], other: 'Fonoaudiología' },
    });
    expect(validateAnswer(q, 'fonoaudiologia').ok).toBe('confirm');
  });

  it('opción "Otro" escrita y respuesta ambigua con confirmación', () => {
    const q = Q('member_relation');
    expect(validateAnswer(q, { other: 'Sobrino' })).toEqual({ ok: true, value: { other: 'Sobrino' } });
    expect(validateAnswer(q, 'hijo/a')).toEqual({ ok: true, value: 'child' });
    const r = validateAnswer(q, 'sobrina');
    expect(r.ok).toBe('confirm');
    if (r.ok === 'confirm') expect(r.candidates.at(-1)!.value).toEqual({ other: 'sobrina' });
  });
});

describe('Validadores', () => {
  it('DNI', () => {
    expect(parseDni('30.123.456')).toEqual({ ok: true, value: '30123456' });
    expect(parseDni('5.123.456')).toEqual({ ok: true, value: '5123456' });
    expect(parseDni('123').ok).toBe(false);
    expect(parseDni('30a123').ok).toBe(false);
    expect(validateAnswer(Q('dni'), { other: 'Pasaporte AAA123' })).toEqual({ ok: true, value: { other: 'Pasaporte AAA123' } });
  });

  it('fechas: formatos, año de 2 dígitos sólo se confirma si es ambiguo, reglas', () => {
    expect(parseDate('05/03/1985', 'birth', TODAY)).toEqual({ ok: true, value: '1985-03-05' });
    expect(parseDate('3 de mayo de 1985', 'birth', TODAY)).toEqual({ ok: true, value: '1985-05-03' });
    expect(parseDate('5-3-85', 'birth', TODAY)).toEqual({ ok: true, value: '1985-03-05' });
    expect(parseDate('5/3/20', 'birth', TODAY).ok).toBe('confirm');
    expect(parseDate('5/3/20', 'birth_adult', TODAY)).toEqual({ ok: true, value: '1920-03-05' });
    expect(parseDate('01/01/2030', 'birth', TODAY).ok).toBe(false);
    expect(parseDate('01/01/2015', 'birth_adult', TODAY).ok).toBe(false);
    expect(parseDate('01/02/2027', 'future', TODAY)).toEqual({ ok: true, value: '2027-02-01' });
    expect(parseDate('30/02/1990', 'birth', TODAY).ok).toBe(false);
  });

  it('teléfonos de Argentina', () => {
    expect(parsePhone('11 2345-6789')).toEqual({ ok: true, value: '+541123456789' });
    expect(parsePhone('+54 9 351 555-1234').ok).toBe(true);
    expect(parsePhone('2345-6789').ok).toBe(false);
    expect(parsePhone('abc').ok).toBe(false);
  });

  it('email con sugerencia de dominio', () => {
    expect(parseEmail('Ana@Gmail.com')).toEqual({ ok: true, value: 'ana@gmail.com' });
    const r = parseEmail('ana@gmial.com');
    expect(r.ok).toBe('confirm');
    if (r.ok === 'confirm') expect(r.candidates[0]!.value).toBe('ana@gmail.com');
    expect(parseEmail('ana@empresa.com.ar')).toEqual({ ok: true, value: 'ana@empresa.com.ar' });
    expect(parseEmail('ana@').ok).toBe(false);
  });
});

describe('Catálogo de localidades (Georef AR)', () => {
  const ctx = (provinceId: string): ValidationContext => ({
    provinceId, provinceName: provinceById(provinceId)?.name, resolveLocality, localityById, today: TODAY,
  });

  it('tiene las 24 provincias y busca sin tildes ni mayúsculas', () => {
    expect(provinceById('14')?.name).toBe('Córdoba');
    expect(searchLocalities('14', 'rio cuarto')[0]!.name).toBe('Río Cuarto');
  });

  it('tolera errores de tipeo y abreviaturas', () => {
    expect(searchLocalities('14', 'rio cuatro')[0]!.name).toBe('Río Cuarto');
    expect(searchLocalities('06', 'gral rodriguez').some((l) => l.name === 'General Rodríguez')).toBe(true);
  });

  it('acepta coincidencias exactas sin repreguntar y confirma las ambiguas', () => {
    expect(validateAnswer(Q('locality'), 'Río Cuarto', ctx('14')).ok).toBe(true);
    expect(validateAnswer(Q('locality'), 'rio cuatro', ctx('14')).ok).toBe('confirm');
    const none = validateAnswer(Q('locality'), 'Zzzyx', ctx('14'));
    expect(none.ok).toBe('confirm');
    if (none.ok === 'confirm') expect(none.candidates[0]!.value).toMatchObject({ verified: false, name: 'Zzzyx' });
  });

  it('elegir de la lista por id y barrios de CABA', () => {
    const palermo = searchLocalities('02', 'palermo')[0]!;
    expect(palermo.name).toBe('Palermo');
    expect(validateAnswer(Q('locality'), { localityId: palermo.id }, ctx('02'))).toMatchObject({ ok: true, value: { name: 'Palermo', verified: true } });
    expect(validateAnswer(Q('locality'), { localityId: palermo.id }, ctx('14')).ok).toBe(false);
  });
});

describe('Casos de ejemplo v2', () => {
  it('cada ejemplo responde todos los pasos visibles y nada más', async () => {
    const { healthV2Examples } = await import('../questionnaires/templates/health-v2.examples');
    for (const ex of healthV2Examples(TODAY)) {
      const steps = expandSteps(QS, ex.answers, TODAY);
      const visible = new Set(steps.map((s) => s.id));
      expect(steps.filter((s) => !(s.id in ex.answers)).map((s) => s.id), ex.id).toEqual([]);
      expect(Object.keys(ex.answers).filter((k) => !visible.has(k)), ex.id).toEqual([]);
      expect(canComplete(QS, ex.answers, TODAY)).toBe(true);
      for (const id of Object.keys(ex.raw ?? {})) expect(visible.has(id), `${ex.id} raw ${id}`).toBe(true);
    }
  });

  it('las localidades verificadas de los ejemplos existen en el catálogo', async () => {
    const { healthV2Examples } = await import('../questionnaires/templates/health-v2.examples');
    for (const ex of healthV2Examples(TODAY)) {
      const l = ex.answers.locality as { id: string | null; verified: boolean; name: string };
      if (l.verified) expect(localityById(l.id!)?.name, ex.id).toBe(l.name);
    }
  });
});
