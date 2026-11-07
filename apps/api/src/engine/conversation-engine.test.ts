import { describe, expect, it } from 'vitest';
import {
  buildProfile,
  buildSummary,
  profileLabel,
  canComplete,
  computeProgress,
  EngineQuestion,
  nextQuestion,
  validateAnswer,
  validateQuestionnaireDefinition,
} from './conversation-engine';
import { DEMO_QUESTIONS } from '../../prisma/demo-questions';

const questions: EngineQuestion[] = DEMO_QUESTIONS.map((q, i) => ({ ...q, id: `q${i}` }));

describe('ConversationEngine — ramificación', () => {
  it('empieza por la primera pregunta según el orden', () => {
    expect(nextQuestion(questions, {})?.key).toBe('full_name');
  });

  it('salta integrantes cuando la cobertura es individual', () => {
    const next = nextQuestion(questions, { full_name: 'Ana Prueba', coverage_type: 'individual' });
    expect(next?.key).toBe('city');
  });

  it('pide integrantes cuando la cobertura es familiar', () => {
    const next = nextQuestion(questions, { full_name: 'Ana Prueba', coverage_type: 'family' });
    expect(next?.key).toBe('members_count');
  });

  it('pide observaciones sólo si el interesado responde Sí', () => {
    const base = {
      full_name: 'Ana', coverage_type: 'individual', city: 'Ciudad Demo',
      contact_channel: 'email', availability: 'morning',
    };
    expect(nextQuestion(questions, { ...base, wants_comments: true })?.key).toBe('comments');
    expect(nextQuestion(questions, { ...base, wants_comments: false })).toBeNull();
    expect(canComplete(questions, { ...base, wants_comments: false })).toBe(true);
  });

  it('el progreso cuenta sólo preguntas visibles', () => {
    const individual = computeProgress(questions, { full_name: 'Ana', coverage_type: 'individual' });
    const family = computeProgress(questions, { full_name: 'Ana', coverage_type: 'family' });
    expect(individual.answered).toBe(2);
    expect(family.total).toBe(individual.total + 1);
  });
});

describe('ConversationEngine — validación', () => {
  const byKey = (k: string) => questions.find((q) => q.key === k)!;

  it('rechaza obligatorias vacías y acepta opcionales vacías', () => {
    expect(validateAnswer(byKey('full_name'), '  ').ok).toBe(false);
    expect(validateAnswer(byKey('comments'), '')).toEqual({ ok: true, value: null });
  });

  it('valida números enteros dentro de rango', () => {
    expect(validateAnswer(byKey('members_count'), '3')).toEqual({ ok: true, value: 3 });
    expect(validateAnswer(byKey('members_count'), '2.5').ok).toBe(false);
    expect(validateAnswer(byKey('members_count'), 99).ok).toBe(false);
    expect(validateAnswer(byKey('members_count'), 'abc').ok).toBe(false);
  });

  it('acepta opción por valor o por etiqueta y rechaza inexistentes', () => {
    expect(validateAnswer(byKey('coverage_type'), 'family')).toEqual({ ok: true, value: 'family' });
    expect(validateAnswer(byKey('coverage_type'), 'familiar')).toEqual({ ok: true, value: 'family' });
    expect(validateAnswer(byKey('coverage_type'), 'otra').ok).toBe(false);
  });

  it('normaliza sí/no', () => {
    expect(validateAnswer(byKey('wants_comments'), 'Sí')).toEqual({ ok: true, value: true });
    expect(validateAnswer(byKey('wants_comments'), false)).toEqual({ ok: true, value: false });
    expect(validateAnswer(byKey('wants_comments'), 'quizás').ok).toBe(false);
  });

  it('valida fechas ISO y DD/MM/AAAA', () => {
    const q: EngineQuestion = { id: 'd', key: 'start', label: 'Inicio', type: 'date', required: true, order: 1 };
    expect(validateAnswer(q, '2026-05-01')).toEqual({ ok: true, value: '2026-05-01' });
    expect(validateAnswer(q, '01/05/2026')).toEqual({ ok: true, value: '2026-05-01' });
    expect(validateAnswer(q, '31/02/2026').ok).toBe(false);
  });
});

describe('ConversationEngine — definición y resumen', () => {
  it('el cuestionario demo es válido', () => {
    expect(validateQuestionnaireDefinition(questions)).toEqual([]);
  });

  it('detecta condiciones hacia preguntas posteriores u opciones inexistentes', () => {
    const broken: EngineQuestion[] = [
      { id: '1', key: 'a', label: 'A', type: 'text', required: true, order: 1, condition: { questionKey: 'b', equals: 'x' } },
      { id: '2', key: 'b', label: 'B', type: 'single_choice', required: true, order: 2, options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
      { id: '3', key: 'c', label: 'C', type: 'text', required: true, order: 3, condition: { questionKey: 'b', equals: 'z' } },
    ];
    const errors = validateQuestionnaireDefinition(broken);
    expect(errors.some((e) => e.includes('"a" depende de "b"'))).toBe(true);
    expect(errors.some((e) => e.includes('opción inexistente "z"'))).toBe(true);
  });

  it('el perfil omite el "Sí" que sólo habilita una observación respondida', () => {
    const keys = buildProfile(questions, { full_name: 'Ana', wants_comments: true, comments: 'Hola' }).map((f) => f.key);
    expect(keys).toEqual(['full_name', 'comments']);
    const skipped = buildProfile(questions, { full_name: 'Ana', wants_comments: true, comments: null }).map((f) => f.key);
    expect(skipped).toEqual(['full_name', 'wants_comments']);
    const declined = buildProfile(questions, { full_name: 'Ana', wants_comments: false }).map((f) => f.key);
    expect(declined).toEqual(['full_name']);
  });

  it('usa etiquetas profesionales: configurada, por defecto o texto limpio', () => {
    const base = { id: 'x', type: 'text' as const, required: true, order: 1 };
    expect(profileLabel({ ...base, key: 'city', label: '¿En qué ciudad vivís?' })).toBe('Ciudad');
    expect(profileLabel({ ...base, key: 'city', label: '¿En qué ciudad vivís?', shortLabel: 'Localidad' })).toBe('Localidad');
    expect(profileLabel({ ...base, key: 'pet', label: '¿tenés mascota? (opcional)' })).toBe('Tenés mascota');
    const profile = buildProfile(questions, { full_name: 'Ana', coverage_type: 'family', members_count: 3 });
    expect(profile.map((f) => `${f.label}: ${f.value}`)).toEqual(['Nombre: Ana', 'Tipo de cobertura: Familiar', 'Integrantes: 3']);
  });

  it('el resumen sólo incluye respuestas presentes', () => {
    const lines = buildSummary(questions, { full_name: 'Ana', coverage_type: 'individual', comments: null });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Individual');
  });
});
