import type { ApplicationStatus } from '@prisma/client';
import type { AnswerMap, AnswerValue, LocalityAnswer } from '../../engine/conversation-engine';

/**
 * Casos de ejemplo de la preentrevista v2. TODOS los datos son ficticios (nombres, documentos,
 * teléfonos, domicilios y declaraciones de salud). Ids fijos: si ya existen, no se vuelven a crear.
 */
export interface HealthExample {
  id: string;
  status: ApplicationStatus;
  /** Inicio de la conversación: hace N horas. */
  startedHoursAgo: number;
  answers: AnswerMap;
  /** Texto original escrito, cuando difiere del valor normalizado. */
  raw?: Record<string, string>;
  /** Respuestas ambiguas que el interesado confirmó. */
  confirmations?: Record<string, { message: string; offered: string[]; chosen: number }>;
  /** Correcciones hechas en la revisión final (valor anterior). */
  corrections?: Record<string, { previousValue: AnswerValue; previousRaw: string }>;
}

const loc = (id: string, name: string, provinceId: string, province: string, department: string): LocalityAnswer => ({
  id, name, provinceId, province, department, verified: true,
});
const no = false;
const none = { values: ['none'] };
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 864e5).toISOString().slice(0, 10);

/**
 * Salud sin antecedentes declarados para una persona (`m0`, `m1`, …).
 * `pregnancy`: respuesta a la pregunta de embarazo, o 'not_asked' si por la edad no se pregunta.
 */
function healthy(m: string, pregnancy: AnswerValue | 'not_asked'): AnswerMap {
  const a: AnswerMap = {
    [`h_history#${m}`]: no, [`h_chronic#${m}`]: no, [`h_hospital#${m}`]: no, [`h_surgery#${m}`]: no,
    [`h_meds#${m}`]: no, [`h_treatments#${m}`]: none, [`h_family#${m}`]: none, [`h_pending#${m}`]: no,
  };
  if (pregnancy !== 'not_asked') a[`h_pregnancy#${m}`] = pregnancy;
  return a;
}

export function healthV2Examples(today: Date): HealthExample[] {
  return [
    {
      // Titular sola, Córdoba. Medicación habitual. Corrigió el teléfono en la revisión.
      id: 'seed-v2-app-01',
      status: 'PENDING_REVIEW',
      startedHoursAgo: 3,
      answers: {
        first_name: 'Mariela', last_name: 'Duarte', dni: '28456123', birth_date: '1981-06-14', sex_id: 'F',
        phone: '+5493515550101', email: 'mariela.duarte@ejemplo.com', contact_channel: 'whatsapp', contact_time: 'afternoon',
        province: '14', locality: loc('14014010', 'Córdoba', '14', 'Córdoba', 'Capital'), street: 'Av. Ficticia 1234',
        apartment: '3º B', postal_code: 'X5000ABC', current_coverage: 'obra_social', current_coverage_name: 'Obra social ficticia',
        work_status: 'employee', transfer_contributions: true, plan_type: 'individual',
        ...healthy('m0', 'no'),
        'h_meds#m0': true, 'h_meds_detail#m0': 'Medicación para la tiroides, una vez por día (dato ficticio).',
        review_ok: true, consent: true,
      },
      raw: { phone: '351 555-0101', birth_date: '14/06/81', postal_code: 'x5000abc' },
      corrections: { phone: { previousValue: '+5493515550110', previousRaw: '351 555-0110' } },
    },
    {
      // Grupo de 3 en Rosario: pareja embarazada con controles, hijo con antecedente respiratorio.
      id: 'seed-v2-app-02',
      status: 'CONTACTED',
      startedHoursAgo: 28,
      answers: {
        first_name: 'Gustavo', last_name: 'Ferreyra', dni: '30987654', birth_date: '1986-02-03', sex_id: 'M',
        phone: '+5493415550202', email: 'gustavo.ferreyra@ejemplo.com', contact_channel: 'phone', contact_time: 'morning',
        province: '82', locality: loc('82084270', 'Rosario', '82', 'Santa Fe', 'Rosario'), street: 'Calle Inventada 456',
        apartment: null, postal_code: '2000', current_coverage: 'prepaga', current_coverage_name: 'Prepaga ficticia',
        work_status: 'monotributo', transfer_contributions: { special: 'unknown' }, plan_type: 'group', members_count: 2,
        'member_relation#m1': 'partner', 'member_name#m1': 'Lucía Ferreyra', 'member_dni#m1': '32456789',
        'member_birth_date#m1': '1989-09-21', 'member_sex#m1': 'F',
        'member_relation#m2': 'child', 'member_name#m2': 'Tomás Ferreyra', 'member_dni#m2': '55123456',
        'member_birth_date#m2': '2016-11-30', 'member_sex#m2': 'M',
        ...healthy('m0', 'na'),
        'h_surgery#m0': true, 'h_surgery_detail#m0': 'Cirugía de apéndice en 2019 (dato ficticio).',
        'h_family#m0': { values: ['cardio'] }, 'h_family_detail#m0': 'Padre con antecedente cardiovascular (dato ficticio).',
        ...healthy('m1', 'yes'),
        'h_preg_weeks#m1': 20, 'h_preg_controls#m1': true, 'h_preg_due#m1': addDays(today, 140),
        ...healthy('m2', 'not_asked'),
        'h_history#m2': true, 'h_history_areas#m2': { values: ['resp'] },
        'h_history_detail#m2': 'Asma leve, usa inhalador ocasionalmente (dato ficticio).',
        'h_family#m2': { special: 'unknown' },
        review_ok: true, consent: true,
      },
      raw: { locality: 'rosario', 'h_preg_weeks#m1': '20 semanas' },
    },
    {
      // Titular con hija. Localidad a verificar, "Prefiero no responder" y un dato contradictorio para revisar.
      id: 'seed-v2-app-03',
      status: 'PENDING_REVIEW',
      startedHoursAgo: 50,
      answers: {
        first_name: 'Rocío', last_name: 'Benítez', dni: '35111222', birth_date: '1992-08-08', sex_id: 'F',
        phone: '+5492615550303', email: 'rocio.benitez@ejemplo.com', contact_channel: 'email', contact_time: 'evening',
        province: '50', locality: { id: null, name: 'Paraje El Ficticio', province: 'Mendoza', provinceId: '50', verified: false },
        street: 'Pasaje Imaginario 78', apartment: null, postal_code: { special: 'unknown' }, current_coverage: 'none',
        work_status: { other: 'Changas eventuales' }, plan_type: 'group', members_count: 1,
        'member_relation#m1': 'child', 'member_name#m1': 'Abril Benítez', 'member_dni#m1': '27333444',
        'member_birth_date#m1': '1979-03-15', 'member_sex#m1': { special: 'prefer_not' },
        ...healthy('m0', 'no'),
        'h_chronic#m0': { special: 'prefer_not' },
        'h_pending#m0': true, 'h_pending_kind#m0': { values: ['study'] },
        'h_pending_detail#m0': 'Estudio indicado para el mes próximo (dato ficticio).',
        ...healthy('m1', 'na'),
        review_ok: true, consent: true,
      },
      raw: { 'member_birth_date#m1': '15/03/1979' },
      confirmations: {
        locality: {
          message: 'No encontramos "Paraje El Ficticio" en Mendoza. ¿La registramos igual para que la verifique un asesor?',
          offered: ['Sí, registrarla para verificar'],
          chosen: 0,
        },
      },
    },
    {
      // Titular de 68 años, jubilado, con enfermedad crónica, internación y medicación. Sin pregunta de embarazo (edad).
      id: 'seed-v2-app-04',
      status: 'PENDING_REVIEW',
      startedHoursAgo: 75,
      answers: {
        first_name: 'Héctor', last_name: 'Giménez', dni: '11222333', birth_date: '1958-01-20', sex_id: 'M',
        phone: '+541155550404', email: 'hector.gimenez@ejemplo.com', contact_channel: 'phone', contact_time: 'morning',
        province: '02', locality: loc('0202101001', 'Balvanera', '02', 'Ciudad Autónoma de Buenos Aires', 'Comuna 3'),
        street: 'Av. de Prueba 900', apartment: '8º A', postal_code: 'C1203ABC', current_coverage: 'obra_social',
        current_coverage_name: 'Obra social de jubilados (ficticia)', work_status: 'retired', plan_type: 'individual',
        ...healthy('m0', 'not_asked'),
        'h_history#m0': true, 'h_history_areas#m0': { values: ['cardio', 'metab'] }, 'h_history_detail#m0': null,
        'h_chronic#m0': true, 'h_chronic_detail#m0': 'Hipertensión y diabetes tipo 2, con controles cada 3 meses (dato ficticio).',
        'h_hospital#m0': true, 'h_hospital_detail#m0': 'Internación de 3 días en 2023 por un control (dato ficticio).',
        'h_meds#m0': true, 'h_meds_detail#m0': { special: 'unknown' },
        'h_treatments#m0': { values: ['other'], other: 'Controles nutricionales' },
        review_ok: true, consent: true,
      },
      raw: { email: 'hector.gimenez@ejemplo.con' },
      confirmations: {
        email: { message: '¿Quisiste escribir hector.gimenez@ejemplo.com?', offered: ['hector.gimenez@ejemplo.com', 'No, es hector.gimenez@ejemplo.con'], chosen: 0 },
      },
    },
  ];
}
