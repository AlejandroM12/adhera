import type { EngineQuestion, QuestionMeta } from '../../engine/conversation-engine';
import { PROVINCES } from '../../catalog/argentina.data';

/**
 * Plantilla "Preentrevista de salud" (v2).
 * Prepara la entrevista con un asesor: no es una declaración jurada, no diagnostica ni evalúa.
 * Las preguntas de salud se hacen por separado para cada persona del grupo (incluida la titular).
 * "No sé" y "Prefiero no responder" son respuestas válidas.
 */
export const HEALTH_V2_KEY = 'health-v2';
export const HEALTH_V2_TITLE = 'Preentrevista de salud';

type TemplateQuestion = Omit<EngineQuestion, 'id' | 'order'>;

const S1 = 'Identificación y contacto';
const S2 = 'Domicilio';
const S3 = 'Cobertura y grupo familiar';
const S4 = 'Antecedentes médicos personales';
const S5 = 'Enfermedades crónicas, internaciones y cirugías';
const S6 = 'Medicación y tratamientos actuales';
const S7 = 'Embarazo y controles';
const S8 = 'Antecedentes familiares';
const S9 = 'Estudios y tratamientos pendientes';
const S10 = 'Revisión y consentimiento';

const UP = { allowUnknown: true, allowPreferNot: true } satisfies QuestionMeta;
const MEMBER = { repeat: 'additional_members', block: 'member', section: S3 } satisfies QuestionMeta;
const health = (section: string, extra: QuestionMeta = {}): QuestionMeta => ({
  repeat: 'all_members',
  block: 'health',
  section,
  ...extra,
});
const SEX_OPTIONS = [
  { value: 'F', label: 'F (femenino)' },
  { value: 'M', label: 'M (masculino)' },
  { value: 'X', label: 'X' },
];

const QUESTIONS: TemplateQuestion[] = [
  // 1. Identificación y contacto
  { key: 'first_name', shortLabel: 'Nombre', label: '¿Cuál es tu nombre? (usá un nombre ficticio)', type: 'text', required: true,
    validation: { minLength: 2, maxLength: 60 }, meta: { section: S1, role: 'titular_first_name' } },
  { key: 'last_name', shortLabel: 'Apellido', label: '¿Y tu apellido?', type: 'text', required: true,
    validation: { minLength: 2, maxLength: 60 }, meta: { section: S1, role: 'titular_last_name' } },
  { key: 'dni', shortLabel: 'DNI', label: '¿Cuál es tu número de DNI? (ficticio)', type: 'dni', required: true,
    meta: { section: S1, role: 'titular_dni', otherLabel: 'No tengo DNI argentino', placeholder: '30.123.456' } },
  { key: 'birth_date', shortLabel: 'Fecha de nacimiento', label: '¿Cuál es tu fecha de nacimiento?', type: 'date', required: true,
    validation: { dateRule: 'birth_adult' }, meta: { section: S1, role: 'birth_date', placeholder: 'DD/MM/AAAA' } },
  { key: 'sex_id', shortLabel: 'Sexo en DNI', label: '¿Qué sexo figura en tu DNI?', type: 'single_choice', required: true,
    options: SEX_OPTIONS, meta: { section: S1, allowPreferNot: true, help: 'Sólo para identificar el documento.' } },
  { key: 'phone', shortLabel: 'Teléfono', label: '¿A qué teléfono te podemos contactar? (con código de área)', type: 'phone', required: true,
    meta: { section: S1, placeholder: '11 2345-6789' } },
  { key: 'email', shortLabel: 'Correo', label: '¿Cuál es tu correo electrónico? (opcional)', type: 'email', required: false,
    meta: { section: S1, placeholder: 'nombre@correo.com' } },
  { key: 'contact_channel', shortLabel: 'Contacto preferido', label: '¿Cómo preferís que te contactemos?', type: 'single_choice', required: true,
    options: [
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'phone', label: 'Llamada' },
      { value: 'email', label: 'Correo electrónico' },
    ], meta: { section: S1 } },
  { key: 'contact_time', shortLabel: 'Franja horaria', label: '¿En qué horario te queda mejor?', type: 'single_choice', required: true,
    options: [
      { value: 'morning', label: 'Mañana (9 a 12 h)' },
      { value: 'afternoon', label: 'Tarde (12 a 18 h)' },
      { value: 'evening', label: 'Noche (18 a 21 h)' },
    ], meta: { section: S1 } },

  // 2. Domicilio
  { key: 'province', shortLabel: 'Provincia', label: '¿En qué provincia vivís?', type: 'single_choice', required: true,
    options: PROVINCES.map((p) => ({ value: p.id, label: p.name })), meta: { section: S2, role: 'province' } },
  { key: 'locality', shortLabel: 'Localidad', label: '¿En qué localidad o barrio?', type: 'locality', required: true,
    meta: { section: S2, role: 'locality', provinceKey: 'province', otherLabel: 'Mi localidad no aparece', placeholder: 'Escribí y elegí de la lista' } },
  { key: 'street', shortLabel: 'Calle y número', label: '¿Calle y número? (ficticios)', type: 'text', required: true,
    validation: { minLength: 3, maxLength: 120 }, meta: { section: S2 } },
  { key: 'apartment', shortLabel: 'Piso y depto.', label: 'Piso y departamento (opcional)', type: 'text', required: false,
    validation: { maxLength: 30 }, meta: { section: S2 } },
  { key: 'postal_code', shortLabel: 'Código postal', label: 'Código postal (opcional)', type: 'text', required: false,
    validation: { pattern: '^(\\d{4}|[A-Z]\\d{4}[A-Z]{3})$', patternMessage: 'El código postal tiene 4 números (1406) o el formato A1234ABC.' },
    meta: { section: S2, allowUnknown: true, placeholder: '1406 o C1406ABC' } },

  // 3. Cobertura y grupo familiar
  { key: 'current_coverage', shortLabel: 'Cobertura actual', label: '¿Tenés cobertura de salud actualmente?', type: 'single_choice', required: true,
    options: [
      { value: 'obra_social', label: 'Obra social' },
      { value: 'prepaga', label: 'Prepaga' },
      { value: 'both', label: 'Obra social y prepaga' },
      { value: 'none', label: 'No tengo cobertura' },
    ], meta: { section: S3, allowUnknown: true } },
  { key: 'current_coverage_name', shortLabel: 'Cobertura (nombre)', label: '¿Cuál es tu cobertura actual?', type: 'text', required: true,
    validation: { minLength: 2, maxLength: 100 }, condition: { questionKey: 'current_coverage', in: ['obra_social', 'prepaga', 'both'] },
    meta: { section: S3, allowUnknown: true } },
  { key: 'work_status', shortLabel: 'Situación laboral', label: '¿Cuál es tu situación laboral?', type: 'single_choice', required: true,
    options: [
      { value: 'employee', label: 'Relación de dependencia' },
      { value: 'monotributo', label: 'Monotributo' },
      { value: 'self_employed', label: 'Autónomo/a' },
      { value: 'retired', label: 'Jubilado/a o pensionado/a' },
      { value: 'none', label: 'Sin actividad laboral' },
    ], meta: { section: S3, allowPreferNot: true, otherLabel: 'Otra' } },
  { key: 'transfer_contributions', shortLabel: 'Derivar aportes', label: '¿Te interesa derivar tus aportes?', type: 'yes_no', required: true,
    condition: { questionKey: 'work_status', in: ['employee', 'monotributo'] }, meta: { section: S3, allowUnknown: true } },
  { key: 'plan_type', shortLabel: 'Tipo de plan', label: '¿El plan sería sólo para vos o también para tu grupo familiar?', type: 'single_choice', required: true,
    options: [
      { value: 'individual', label: 'Sólo para mí' },
      { value: 'group', label: 'Con grupo familiar' },
    ], meta: { section: S3, role: 'plan_type' } },
  { key: 'members_count', shortLabel: 'Integrantes adicionales', label: '¿Cuántas personas, además de vos, integrarían el plan?', type: 'number', required: true,
    validation: { min: 1, max: 10, integer: true }, condition: { questionKey: 'plan_type', equals: 'group' }, meta: { section: S3, role: 'members_count' } },
  { key: 'member_relation', shortLabel: 'Vínculo', label: 'Integrante {n}: ¿qué vínculo tiene con vos?', type: 'single_choice', required: true,
    options: [
      { value: 'spouse', label: 'Cónyuge' },
      { value: 'partner', label: 'Pareja conviviente' },
      { value: 'child', label: 'Hijo/a' },
      { value: 'parent', label: 'Padre o madre' },
    ], meta: { ...MEMBER, role: 'member_relation', otherLabel: 'Otro vínculo' } },
  { key: 'member_name', shortLabel: 'Nombre y apellido', label: 'Integrante {n}: ¿cuál es su nombre y apellido? (ficticio)', type: 'text', required: true,
    validation: { minLength: 3, maxLength: 100 }, meta: { ...MEMBER, role: 'member_name' } },
  { key: 'member_dni', shortLabel: 'DNI', label: '¿Cuál es el DNI de {nombre}? (ficticio)', type: 'dni', required: true,
    meta: { ...MEMBER, role: 'member_dni', otherLabel: 'No tiene DNI argentino' } },
  { key: 'member_birth_date', shortLabel: 'Fecha de nacimiento', label: '¿Cuál es la fecha de nacimiento de {nombre}?', type: 'date', required: true,
    validation: { dateRule: 'birth' }, meta: { ...MEMBER, role: 'member_birth_date', placeholder: 'DD/MM/AAAA' } },
  { key: 'member_sex', shortLabel: 'Sexo en DNI', label: '¿Qué sexo figura en el DNI de {nombre}?', type: 'single_choice', required: true,
    options: SEX_OPTIONS, meta: { ...MEMBER, allowPreferNot: true } },

  // 4. Antecedentes médicos personales (por persona)
  { key: 'h_history', shortLabel: 'Antecedentes para declarar', label: '¿{nombre} tiene antecedentes médicos que quiera declarar?', type: 'yes_no', required: true,
    meta: health(S4, { ...UP, labelSelf: 'Ahora unas preguntas de salud sobre vos. ¿Tenés antecedentes médicos que quieras declarar?',
      help: 'Respondé según lo que sepas. Esto no es un diagnóstico ni una evaluación.' }) },
  { key: 'h_history_areas', shortLabel: 'Áreas', label: '¿En qué áreas? Podés elegir varias.', type: 'multi_choice', required: true,
    options: [
      { value: 'cardio', label: 'Cardiovasculares' },
      { value: 'resp', label: 'Respiratorios' },
      { value: 'metab', label: 'Metabólicos o endocrinos' },
      { value: 'neuro', label: 'Neurológicos' },
      { value: 'onco', label: 'Oncológicos' },
      { value: 'mental', label: 'Salud mental' },
      { value: 'osteo', label: 'Huesos y articulaciones' },
      { value: 'digest', label: 'Digestivos' },
      { value: 'renal', label: 'Renales o urinarios' },
      { value: 'other', label: 'Otro' },
    ], condition: { questionKey: 'h_history', equals: true }, meta: health(S4, UP) },
  { key: 'h_history_detail', shortLabel: 'Detalle', label: 'Si querés, contá brevemente cuáles (por ejemplo, el antecedente y el año).', type: 'text', required: false,
    validation: { maxLength: 500 }, condition: { questionKey: 'h_history', equals: true }, meta: health(S4) },

  // 5. Enfermedades crónicas, internaciones y cirugías
  { key: 'h_chronic', shortLabel: 'Enfermedad crónica', label: '¿{nombre} tiene alguna enfermedad crónica diagnosticada?', type: 'yes_no', required: true,
    meta: health(S5, { ...UP, labelSelf: '¿Tenés alguna enfermedad crónica diagnosticada?' }) },
  { key: 'h_chronic_detail', shortLabel: 'Cuál y seguimiento', label: '¿Cuál o cuáles? ¿Hace tratamiento o seguimiento?', type: 'text', required: true,
    validation: { minLength: 2, maxLength: 500 }, condition: { questionKey: 'h_chronic', equals: true }, meta: health(S5, UP) },
  { key: 'h_hospital', shortLabel: 'Internaciones (5 años)', label: '¿{nombre} estuvo internado/a en los últimos 5 años?', type: 'yes_no', required: true,
    meta: health(S5, { ...UP, labelSelf: '¿Estuviste internado/a en los últimos 5 años?' }) },
  { key: 'h_hospital_detail', shortLabel: 'Motivo y año', label: 'Contanos el motivo y el año aproximado de cada internación.', type: 'text', required: true,
    validation: { minLength: 2, maxLength: 500 }, condition: { questionKey: 'h_hospital', equals: true }, meta: health(S5, UP) },
  { key: 'h_surgery', shortLabel: 'Cirugías', label: '¿{nombre} tuvo cirugías?', type: 'yes_no', required: true,
    meta: health(S5, { ...UP, labelSelf: '¿Tuviste cirugías?' }) },
  { key: 'h_surgery_detail', shortLabel: 'Cuáles y año', label: '¿Qué cirugías y en qué año aproximado?', type: 'text', required: true,
    validation: { minLength: 2, maxLength: 500 }, condition: { questionKey: 'h_surgery', equals: true }, meta: health(S5, UP) },

  // 6. Medicación y tratamientos actuales
  { key: 'h_meds', shortLabel: 'Medicación habitual', label: '¿{nombre} toma medicación de forma habitual?', type: 'yes_no', required: true,
    meta: health(S6, { ...UP, labelSelf: '¿Tomás medicación de forma habitual?' }) },
  { key: 'h_meds_detail', shortLabel: 'Medicación', label: '¿Qué medicación? (nombre y, si la sabés, la dosis)', type: 'text', required: true,
    validation: { minLength: 2, maxLength: 500 }, condition: { questionKey: 'h_meds', equals: true }, meta: health(S6, UP) },
  { key: 'h_treatments', shortLabel: 'Tratamientos en curso', label: '¿{nombre} hace algún tratamiento actualmente?', type: 'multi_choice', required: true,
    options: [
      { value: 'none', label: 'Ninguno', exclusive: true },
      { value: 'rehab', label: 'Kinesiología o rehabilitación' },
      { value: 'psy', label: 'Psicoterapia o tratamiento psiquiátrico' },
      { value: 'dialysis', label: 'Diálisis' },
      { value: 'onco', label: 'Tratamiento oncológico' },
      { value: 'other', label: 'Otro' },
    ], meta: health(S6, { ...UP, labelSelf: '¿Hacés algún tratamiento actualmente?' }) },

  // 7. Embarazo y controles (no depende del sexo del DNI: incluye "No corresponde")
  { key: 'h_pregnancy', shortLabel: 'Embarazo en curso', label: '¿{nombre} está cursando un embarazo?', type: 'single_choice', required: true,
    options: [
      { value: 'yes', label: 'Sí' },
      { value: 'no', label: 'No' },
      { value: 'na', label: 'No corresponde' },
    ], meta: health(S7, { ...UP, role: 'pregnancy', memberAge: { min: 10, max: 60 }, labelSelf: '¿Estás cursando un embarazo?',
      help: 'Si no corresponde, elegí "No corresponde".' }) },
  { key: 'h_preg_weeks', shortLabel: 'Semanas (aprox.)', label: '¿De cuántas semanas, aproximadamente?', type: 'number', required: true,
    validation: { min: 1, max: 42, integer: true }, condition: { questionKey: 'h_pregnancy', equals: 'yes' },
    meta: health(S7, { allowUnknown: true, role: 'pregnancy_weeks' }) },
  { key: 'h_preg_controls', shortLabel: 'Controles en curso', label: '¿Está haciendo los controles de embarazo?', type: 'yes_no', required: true,
    condition: { questionKey: 'h_pregnancy', equals: 'yes' }, meta: health(S7, { allowUnknown: true, labelSelf: '¿Estás haciendo los controles de embarazo?' }) },
  { key: 'h_preg_due', shortLabel: 'Fecha probable de parto', label: 'Fecha probable de parto (si la sabés)', type: 'date', required: true,
    validation: { dateRule: 'future' }, condition: { questionKey: 'h_pregnancy', equals: 'yes' },
    meta: health(S7, { allowUnknown: true, role: 'pregnancy_due', placeholder: 'DD/MM/AAAA' }) },

  // 8. Antecedentes familiares conocidos
  { key: 'h_family', shortLabel: 'Antecedentes familiares', label: '¿Hay antecedentes de salud conocidos en familiares directos de {nombre} (padres o hermanos)?', type: 'multi_choice', required: true,
    options: [
      { value: 'none', label: 'Ninguno conocido', exclusive: true },
      { value: 'cardio', label: 'Cardiovasculares' },
      { value: 'diabetes', label: 'Diabetes' },
      { value: 'onco', label: 'Oncológicos' },
      { value: 'neuro', label: 'Neurológicos' },
      { value: 'mental', label: 'Salud mental' },
      { value: 'other', label: 'Otro' },
    ], meta: health(S8, { ...UP, labelSelf: '¿Hay antecedentes de salud conocidos en tus familiares directos (padres o hermanos)?' }) },
  { key: 'h_family_detail', shortLabel: 'Detalle', label: 'Si querés, agregá detalles (quién y qué).', type: 'text', required: false,
    validation: { maxLength: 500 }, condition: { questionKey: 'h_family', excludes: 'none', answered: true }, meta: health(S8) },

  // 9. Estudios, tratamientos o procedimientos pendientes
  { key: 'h_pending', shortLabel: 'Pendientes', label: '¿{nombre} tiene estudios, tratamientos o procedimientos indicados que todavía no se hizo?', type: 'yes_no', required: true,
    meta: health(S9, { ...UP, labelSelf: '¿Tenés estudios, tratamientos o procedimientos indicados que todavía no te hiciste?' }) },
  { key: 'h_pending_kind', shortLabel: 'Tipo', label: '¿De qué tipo? Podés elegir varios.', type: 'multi_choice', required: true,
    options: [
      { value: 'study', label: 'Estudio' },
      { value: 'surgery', label: 'Cirugía o procedimiento programado' },
      { value: 'treatment', label: 'Tratamiento' },
      { value: 'other', label: 'Otro' },
    ], condition: { questionKey: 'h_pending', equals: true }, meta: health(S9, UP) },
  { key: 'h_pending_detail', shortLabel: 'Cuál y cuándo', label: '¿Cuál y para cuándo está previsto, aproximadamente?', type: 'text', required: true,
    validation: { minLength: 2, maxLength: 500 }, condition: { questionKey: 'h_pending', equals: true }, meta: health(S9, UP) },

  // 10. Revisión final y consentimiento
  { key: 'review_ok', shortLabel: 'Revisión confirmada', label: 'Revisá el resumen de tus respuestas. ¿Está todo correcto según tu conocimiento?', type: 'yes_no', required: true,
    validation: { mustBeTrue: true, mustBeTrueMessage: 'Podés corregir cualquier respuesta con "Corregir". Cuando esté todo bien, confirmá.' },
    meta: { section: S10, role: 'review' } },
  { key: 'consent', shortLabel: 'Consentimiento', label: 'Entiendo que esta es una preentrevista para preparar la reunión con un asesor y no una declaración jurada de salud. Acepto que mis respuestas se guarden para esa entrevista. (Demo: sólo datos ficticios.)', type: 'yes_no', required: true,
    validation: { mustBeTrue: true, mustBeTrueMessage: 'Sin tu consentimiento no podemos enviar la preentrevista.' },
    meta: { section: S10, role: 'consent' } },
];

/** Preguntas de la plantilla con orden asignado. */
export function healthV2Questions(): Omit<EngineQuestion, 'id'>[] {
  return QUESTIONS.map((q, i) => ({ ...q, order: i + 1 }));
}

/** Versión del texto de consentimiento (se registra al finalizar). */
export const HEALTH_V2_CONSENT_VERSION = 'preentrevista-v2-2026-11';
