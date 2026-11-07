import { api } from '@/lib/api';
import type { AnswerInput, PublicQuestion } from '@/lib/types';

/**
 * Respuestas ficticias para completar la demo rápidamente (botón "Completar con datos ficticios").
 * Todo es inventado: nombres, documentos, teléfonos, domicilios y declaraciones de salud.
 */
const FIRST = ['Valeria', 'Martín', 'Carla', 'Diego', 'Paula', 'Nicolás', 'Julieta', 'Santiago'];
const LAST = ['Demo', 'Ejemplo', 'Ficticio', 'Prueba', 'Muestra'];
const CHILD = ['Lola', 'Benjamín', 'Mía', 'Thiago', 'Emma'];

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;
const chance = (p: number) => Math.random() < p;
const num = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pad = (n: number) => String(n).padStart(2, '0');
const date = (yearMin: number, yearMax: number) => `${pad(num(1, 28))}/${pad(num(1, 12))}/${num(yearMin, yearMax)}`;
const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Answer = { value: AnswerInput; display: string };
const special = (q: PublicQuestion): Answer | null =>
  q.allowUnknown && chance(0.08) ? { value: { special: 'unknown' }, display: 'No sé' } : null;

export async function fictionalAnswer(q: PublicQuestion, ctx: { first?: string; last?: string }): Promise<Answer> {
  const key = q.questionKey ?? q.key;
  const opts = q.options ?? [];
  const option = (value?: string) => {
    const o = (value && opts.find((x) => x.value === value)) || pick(opts.filter((x) => !x.exclusive && x.value !== 'other'));
    return { value: o.value, display: o.label };
  };
  const yes = (p: number): Answer => (chance(p) ? { value: true, display: 'Sí' } : { value: false, display: 'No' });
  const detail: Answer = { value: 'Dato ficticio de ejemplo para la demostración.', display: 'Dato ficticio de ejemplo para la demostración.' };

  switch (key) {
    case 'first_name': { const v = ctx.first ?? pick(FIRST); return { value: v, display: v }; }
    case 'last_name': { const v = ctx.last ?? pick(LAST); return { value: v, display: v }; }
    case 'dni':
    case 'member_dni': { const v = String(num(20_000_000, 45_999_999)); return { value: v, display: v }; }
    case 'birth_date': { const v = date(1972, 1995); return { value: v, display: v }; }
    case 'phone': { const v = `11 5555-01${pad(num(0, 99))}`; return { value: v, display: v }; }
    case 'email': { const v = `${ascii(ctx.first ?? 'demo')}.${ascii(ctx.last ?? 'ejemplo')}@ejemplo.com`; return { value: v, display: v }; }
    case 'province': return option(pick(['02', '06', '14', '82', '50']));
    case 'locality': {
      for (const q2 of ['san', 'villa', 'la']) {
        const r = await api<{ id: string; name: string }[]>(`/catalog/localities?province=${q.provinceId}&q=${q2}`).catch(() => []);
        if (r[0]) return { value: { localityId: r[0].id }, display: r[0].name };
      }
      return { value: { other: 'Localidad ficticia' }, display: 'Localidad ficticia (a verificar)' };
    }
    case 'street': { const v = `Calle Ficticia ${num(100, 4999)}`; return { value: v, display: v }; }
    case 'apartment': return { value: null, display: 'Omitida' };
    case 'postal_code': return { value: { special: 'unknown' }, display: 'No sé' };
    case 'current_coverage_name':
    case 'h_chronic_detail': case 'h_hospital_detail': case 'h_surgery_detail': case 'h_meds_detail':
    case 'h_pending_detail': case 'h_history_detail': case 'h_family_detail':
      return detail;
    case 'plan_type': return option(chance(0.65) ? 'group' : 'individual');
    case 'members_count': { const v = num(1, 2); return { value: v, display: String(v) }; }
    case 'member_relation': return option(q.member?.id === 'm1' ? 'partner' : 'child');
    case 'member_name': { const v = `${q.member?.id === 'm1' ? pick(FIRST) : pick(CHILD)} ${ctx.last ?? pick(LAST)}`; return { value: v, display: v }; }
    case 'member_birth_date': { const v = q.label.includes('Integrante 1') || q.member?.id === 'm1' ? date(1975, 1996) : date(2010, 2021); return { value: v, display: v }; }
    case 'h_history': case 'h_chronic': case 'h_hospital': case 'h_surgery': case 'h_meds': case 'h_pending':
      return special(q) ?? yes(0.2);
    case 'h_treatments':
    case 'h_family':
      if (chance(0.7)) return { value: { values: ['none'] }, display: opts.find((o) => o.value === 'none')?.label ?? 'Ninguno' };
      return { value: { values: [option().value] }, display: option().display };
    case 'h_pregnancy': return option(chance(0.15) ? 'yes' : 'na');
    case 'h_preg_weeks': return { value: num(8, 30), display: 'semanas' };
    case 'h_preg_due': return { value: { special: 'unknown' }, display: 'No sé' };
  }
  // Respaldo genérico por tipo.
  switch (q.type) {
    case 'yes_no': return yes(0.2);
    case 'single_choice': return option();
    case 'multi_choice': { const o = option(); return { value: { values: [o.value] }, display: o.display }; }
    case 'number': return { value: 1, display: '1' };
    case 'date': return { value: date(1980, 1995), display: 'fecha' };
    case 'dni': return { value: '30111222', display: '30111222' };
    case 'phone': return { value: '11 5555-0100', display: '11 5555-0100' };
    case 'email': return { value: 'demo@ejemplo.com', display: 'demo@ejemplo.com' };
    case 'locality': return { value: { other: 'Localidad ficticia' }, display: 'Localidad ficticia' };
    default: return q.required ? detail : { value: null, display: 'Omitida' };
  }
}

export const fictionalNames = () => ({ first: pick(FIRST), last: pick(LAST) });
