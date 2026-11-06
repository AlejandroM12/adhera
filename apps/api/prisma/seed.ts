/**
 * Seed idempotente de demostración: asesores, cuestionario publicado y 20 casos ficticios
 * coherentes (enviadas, en gestión, entrevistas, conversaciones activas y abandonadas).
 * Usa IDs fijos: si un registro ya existe, no lo modifica (no borra datos del simulador).
 * Todos los nombres y textos son inventados; no hay datos médicos ni sensibles.
 */
import { ActorType, ApplicationStatus, InterviewStatus, Prisma, PrismaClient, SessionStatus, VersionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { DEMO_QUESTIONS } from './demo-questions';

const prisma = new PrismaClient();

// Credenciales ficticias de demo (documentadas en README). Nunca usar en producción.
const DEMO_PASSWORD = 'adhera-demo';
const ADVISORS = [
  { id: 'seed-user-1', displayName: 'Laura Méndez', email: 'asesor@adhera.demo' },
  { id: 'seed-user-2', displayName: 'Martín Paz', email: 'martin@adhera.demo' },
  { id: 'seed-user-3', displayName: 'Sofía Herrera', email: 'sofia@adhera.demo' },
];
const LAURA = 0;
const MARTIN = 1;
const SOFIA = 2;

const QUESTIONNAIRE_ID = 'seed-questionnaire';
const VERSION_ID = 'seed-version-1';

type Coverage = 'individual' | 'family' | 'corporate';
type Channel = 'messaging' | 'phone' | 'email';
type Slot = 'morning' | 'afternoon' | 'evening';

type Profile = {
  name: string;
  coverage: Coverage;
  members?: number;
  city: string;
  channel: Channel;
  availability: Slot;
  comments?: string;
  status: ApplicationStatus;
  /** Inicio de la conversación: hace N horas (admite decimales). */
  startedHoursAgo: number;
  advisor?: number;
  notes?: { text: string; hoursAfter: number; by?: number }[];
  interview?: { inDays: number; hour: number; minute?: number; status: InterviewStatus; notes?: string; nextStep?: string };
  /** Conversaciones sin enviar: cantidad de respuestas dadas. */
  answeredCount?: number;
};

const H = 1;
const D = 24;

const PROFILES: Profile[] = [
  // --- Recién enviadas, esperan revisión ---
  { name: 'Valentina Ríos', coverage: 'family', members: 4, city: 'Córdoba', channel: 'messaging', availability: 'afternoon', comments: 'Somos cuatro en casa. Queremos comparar opciones antes de fin de mes.', status: 'PENDING_REVIEW', startedHoursAgo: 2 * H },
  { name: 'Tomás Acosta', coverage: 'individual', city: 'Rosario', channel: 'email', availability: 'morning', status: 'PENDING_REVIEW', startedHoursAgo: 5 * H },
  { name: 'Mateo Giménez', coverage: 'corporate', members: 18, city: 'Tucumán', channel: 'email', availability: 'afternoon', comments: 'Consulta para el equipo de una distribuidora. Necesitamos propuesta para 18 personas.', status: 'PENDING_REVIEW', startedHoursAgo: 1 * D + 3 },
  { name: 'Lucía Fernández', coverage: 'individual', city: 'Mendoza', channel: 'phone', availability: 'evening', status: 'PENDING_REVIEW', startedHoursAgo: 2 * D + 6, advisor: SOFIA },

  // --- En gestión: contactadas ---
  { name: 'Camila Sosa', coverage: 'corporate', members: 12, city: 'Mendoza', channel: 'phone', availability: 'morning', comments: 'Tenemos un estudio contable y queremos sumar el beneficio para el equipo.', status: 'CONTACTED', startedHoursAgo: 3 * D, advisor: LAURA,
    notes: [{ text: 'Primer llamado realizado. Pidió una propuesta para 12 personas y prefiere recibirla por correo.', hoursAfter: 3 }] },
  { name: 'Agustina Molina', coverage: 'individual', city: 'Neuquén', channel: 'messaging', availability: 'evening', status: 'CONTACTED', startedHoursAgo: 5 * D, advisor: SOFIA,
    notes: [
      { text: 'Le envié información general por mensajería. Responde después de las 19 h.', hoursAfter: 20 },
      { text: 'Confirmó que recibió la información. Vuelvo a escribirle el lunes.', hoursAfter: 46 },
    ] },
  { name: 'Ignacio Romero', coverage: 'family', members: 3, city: 'Salta', channel: 'phone', availability: 'morning', status: 'CONTACTED', startedHoursAgo: 4 * D, advisor: MARTIN,
    notes: [{ text: 'Hablamos 10 minutos. Quiere incluir a su pareja y a su hija. Le propongo entrevista para la semana próxima.', hoursAfter: 5 }] },

  // --- Entrevistas programadas (próximos días, horario laboral) ---
  { name: 'Joaquín Herrera', coverage: 'family', members: 3, city: 'La Plata', channel: 'messaging', availability: 'morning', status: 'INTERVIEW_SCHEDULED', startedHoursAgo: 3 * D + 4, advisor: MARTIN,
    notes: [{ text: 'Prefiere videollamada. Confirmar el día anterior por mensajería.', hoursAfter: 4 }],
    interview: { inDays: 1, hour: 10, status: 'SCHEDULED', notes: 'Videollamada. Revisar opciones de plan familiar.' } },
  { name: 'Martina López', coverage: 'individual', city: 'Mar del Plata', channel: 'email', availability: 'afternoon', status: 'INTERVIEW_SCHEDULED', startedHoursAgo: 4 * D, advisor: LAURA,
    interview: { inDays: 2, hour: 16, minute: 30, status: 'SCHEDULED', notes: 'Llamada telefónica.' } },
  { name: 'Julieta Castro', coverage: 'family', members: 2, city: 'Santa Fe', channel: 'phone', availability: 'afternoon', comments: 'Nos mudamos hace poco y estamos organizando todo.', status: 'INTERVIEW_SCHEDULED', startedHoursAgo: 6 * D, advisor: MARTIN,
    interview: { inDays: 3, hour: 15, status: 'SCHEDULED', notes: 'Confirmar horario el día anterior.' } },
  { name: 'Federico Ruiz', coverage: 'corporate', members: 8, city: 'Córdoba', channel: 'email', availability: 'morning', status: 'INTERVIEW_SCHEDULED', startedHoursAgo: 2 * D, advisor: SOFIA,
    notes: [{ text: 'Es el responsable de administración de una agencia de diseño. Pidió reunión con los socios.', hoursAfter: 2 }],
    interview: { inDays: 4, hour: 11, minute: 30, status: 'SCHEDULED', notes: 'Reunión con los dos socios.' } },

  // --- Cerradas ---
  { name: 'Lucas Benítez', coverage: 'family', members: 5, city: 'Salta', channel: 'phone', availability: 'morning', comments: 'Queremos comparar planes con calma.', status: 'CLOSED', startedHoursAgo: 12 * D, advisor: SOFIA,
    notes: [{ text: 'Decidió posponer la decisión hasta después del verano.', hoursAfter: 6 * D }],
    interview: { inDays: -6, hour: 11, status: 'COMPLETED', notes: 'Se presentaron tres alternativas.', nextStep: 'Volver a contactar en marzo.' } },
  { name: 'Benjamín Torres', coverage: 'individual', city: 'Bahía Blanca', channel: 'messaging', availability: 'morning', status: 'CLOSED', startedHoursAgo: 15 * D, advisor: LAURA,
    notes: [{ text: 'Canceló la entrevista: ya resolvió su cobertura por otra vía.', hoursAfter: 4 * D }],
    interview: { inDays: -10, hour: 15, status: 'CANCELLED', notes: 'El interesado canceló.' } },
  { name: 'Paula Medina', coverage: 'family', members: 4, city: 'Paraná', channel: 'email', availability: 'afternoon', status: 'CLOSED', startedHoursAgo: 20 * D, advisor: MARTIN,
    interview: { inDays: -14, hour: 17, status: 'COMPLETED', notes: 'Entrevista completa. Recibió la propuesta.', nextStep: 'Seguimiento comercial cerrado: avanzó con la propuesta.' } },
  { name: 'Diego Navarro', coverage: 'individual', city: 'Rosario', channel: 'phone', availability: 'afternoon', status: 'PENDING_REVIEW', startedHoursAgo: 9 * D },

  // --- Conversaciones activas (respondiendo ahora) ---
  { name: 'Renata Vega', coverage: 'family', members: 3, city: 'San Juan', channel: 'phone', availability: 'morning', status: 'IN_PROGRESS', startedHoursAgo: 0.2, answeredCount: 4 },
  { name: 'Santiago Correa', coverage: 'individual', city: 'Posadas', channel: 'email', availability: 'evening', status: 'IN_PROGRESS', startedHoursAgo: 1.5, answeredCount: 2 },

  // --- Abandonadas (más de 24 h sin actividad); algunas ya en recuperación ---
  { name: 'Carolina Suárez', coverage: 'family', members: 4, city: 'Corrientes', channel: 'messaging', availability: 'evening', status: 'IN_PROGRESS', startedHoursAgo: 2 * D, answeredCount: 5 },
  { name: 'Nicolás Ortiz', coverage: 'corporate', members: 6, city: 'Rafaela', channel: 'phone', availability: 'morning', status: 'IN_PROGRESS', startedHoursAgo: 3 * D, answeredCount: 3, advisor: MARTIN,
    notes: [{ text: 'Dejó la conversación a mitad. Intento llamarlo por la mañana para completar los datos.', hoursAfter: 30 }] },
  { name: 'Florencia Álvarez', coverage: 'individual', city: 'Villa María', channel: 'email', availability: 'afternoon', status: 'IN_PROGRESS', startedHoursAgo: 5 * D, answeredCount: 2 },
];

const json = (v: unknown) => (v === undefined || v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue));
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);
const hoursAfter = (d: Date, h: number) => new Date(d.getTime() + h * 3600 * 1000);
const minutesAfter = (d: Date, m: number) => new Date(d.getTime() + m * 60 * 1000);

/** Día hábil relativo a hoy (saltea sábado y domingo) a la hora indicada. */
function businessDay(inDays: number, hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  let left = Math.abs(inDays);
  const step = inDays >= 0 ? 1 : -1;
  while (left > 0) {
    date.setDate(date.getDate() + step);
    if (date.getDay() !== 0 && date.getDay() !== 6) left--;
  }
  return date;
}

const IS_PRODUCTION = process.env.APP_ENV === 'production';

/**
 * Desarrollo/pruebas: 3 asesores demo con contraseña conocida.
 * Producción: un único administrador definido por variables de entorno (sin credenciales demo).
 * Devuelve los ids a usar para los asesores 0, 1 y 2 de los casos demo.
 */
async function seedUsers(): Promise<string[]> {
  if (IS_PRODUCTION) {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? '';
    if (!email || password.length < 12) {
      throw new Error('En producción definí ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres) para crear el administrador.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName: process.env.ADMIN_NAME?.trim() || 'Administrador', passwordHash },
    });
    return [admin.id, admin.id, admin.id];
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of ADVISORS) {
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash } });
  }
  const users = await prisma.user.findMany({ where: { email: { in: ADVISORS.map((u) => u.email) } } });
  return ADVISORS.map((a) => users.find((u) => u.email === a.email)!.id);
}

async function seedQuestionnaire() {
  await prisma.questionnaire.upsert({
    where: { id: QUESTIONNAIRE_ID },
    update: {},
    create: { id: QUESTIONNAIRE_ID, name: 'Preafiliación general' },
  });
  const existing = await prisma.questionnaireVersion.findUnique({ where: { id: VERSION_ID } });
  if (!existing) {
    await prisma.questionnaireVersion.create({
      data: {
        id: VERSION_ID,
        questionnaireId: QUESTIONNAIRE_ID,
        version: 1,
        status: VersionStatus.PUBLISHED,
        publishedAt: hoursAgo(30 * D),
        questions: {
          create: DEMO_QUESTIONS.map((q) => ({
            key: q.key,
            label: q.label,
            shortLabel: q.shortLabel ?? null,
            type: q.type,
            required: q.required,
            order: q.order,
            optionsJson: json(q.options),
            conditionJson: json(q.condition),
            validationJson: json(q.validation),
          })),
        },
      },
    });
  }
  return prisma.question.findMany({ where: { versionId: VERSION_ID }, orderBy: { order: 'asc' } });
}

function answersFor(p: Profile): Array<[string, string | number | boolean | null]> {
  const list: Array<[string, string | number | boolean | null]> = [
    ['full_name', p.name],
    ['coverage_type', p.coverage],
  ];
  if (p.coverage !== 'individual') list.push(['members_count', p.members ?? 2]);
  list.push(['city', p.city], ['contact_channel', p.channel], ['availability', p.availability]);
  list.push(['wants_comments', Boolean(p.comments)]);
  if (p.comments) list.push(['comments', p.comments]);
  return p.answeredCount !== undefined ? list.slice(0, p.answeredCount) : list;
}

async function seedApplications(advisorIds: string[], questions: { id: string; key: string }[]) {
  const qByKey = new Map(questions.map((q) => [q.key, q]));
  let created = 0;

  for (const [i, p] of PROFILES.entries()) {
    const id = `seed-app-${String(i + 1).padStart(2, '0')}`;
    if (await prisma.application.findUnique({ where: { id } })) continue;

    const createdAt = hoursAgo(p.startedHoursAgo);
    const answers = answersFor(p);
    const completed = p.status !== ApplicationStatus.IN_PROGRESS;
    // Ritmo realista: ~35-50 s por respuesta.
    const answerTimes = answers.map((_, n) => new Date(createdAt.getTime() + (n + 1) * (35 + ((i * 7 + n * 5) % 15)) * 1000));
    const lastAnswerAt = answerTimes.at(-1) ?? createdAt;
    const completedAt = completed ? minutesAfter(lastAnswerAt, 1) : null;
    const advisorId = p.advisor !== undefined ? advisorIds[p.advisor]! : null;
    const remaining = questions.find((q) => !answers.some(([k]) => k === q.key));
    const base = completedAt ?? lastAnswerAt;

    await prisma.$transaction(async (tx) => {
      await tx.application.create({
        data: {
          id,
          displayName: (answers.find(([k]) => k === 'full_name')?.[1] as string | undefined) ?? 'Interesado sin nombre',
          status: p.status,
          assignedUserId: advisorId,
          createdAt,
          completedAt,
        },
      });
      const session = await tx.conversationSession.create({
        data: {
          applicationId: id,
          versionId: VERSION_ID,
          status: completed ? SessionStatus.COMPLETED : SessionStatus.IN_PROGRESS,
          // Token aleatorio descartado: las sesiones seed no se pueden retomar.
          resumeTokenHash: createHash('sha256').update(randomBytes(24)).digest('hex'),
          currentQuestionKey: completed ? null : (remaining?.key ?? null),
          startedAt: createdAt,
          completedAt,
        },
      });
      const events: Prisma.ActivityEventCreateManyInput[] = [
        { applicationId: id, actorType: ActorType.APPLICANT, kind: 'SESSION_STARTED', payloadJson: { version: 1 }, createdAt },
      ];
      for (const [n, [key, value]] of answers.entries()) {
        const at = answerTimes[n]!;
        await tx.answer.create({
          data: {
            sessionId: session.id,
            questionId: qByKey.get(key)!.id,
            valueJson: value === null ? Prisma.DbNull : value,
            rawText: String(value),
            createdAt: at,
          },
        });
        events.push({ applicationId: id, actorType: ActorType.APPLICANT, kind: 'ANSWER_RECORDED', payloadJson: { questionKey: key }, createdAt: at });
      }
      if (completedAt) {
        events.push(
          { applicationId: id, actorType: ActorType.APPLICANT, kind: 'SESSION_COMPLETED', createdAt: completedAt },
          { applicationId: id, actorType: ActorType.SYSTEM, kind: 'STATUS_CHANGED', payloadJson: { from: 'IN_PROGRESS', to: 'PENDING_REVIEW' }, createdAt: completedAt },
        );
      }
      if (advisorId) {
        events.push({ applicationId: id, actorType: ActorType.ADVISOR, actorId: advisorId, kind: 'ASSIGNED', payloadJson: { assignedUserId: advisorId }, createdAt: hoursAfter(base, 1) });
      }
      for (const n of p.notes ?? []) {
        const author = n.by !== undefined ? advisorIds[n.by]! : advisorId;
        if (!author) continue;
        const at = hoursAfter(base, n.hoursAfter);
        if (at > new Date()) continue;
        const note = await tx.note.create({ data: { applicationId: id, authorId: author, content: n.text, createdAt: at } });
        events.push({ applicationId: id, actorType: ActorType.ADVISOR, actorId: author, kind: 'NOTE_ADDED', payloadJson: { noteId: note.id }, createdAt: at });
      }
      if (p.interview && advisorId) {
        const scheduledAt = businessDay(p.interview.inDays, p.interview.hour, p.interview.minute);
        const scheduledOn = hoursAfter(base, 2);
        const iv = await tx.interview.create({
          data: {
            applicationId: id,
            advisorId,
            scheduledAt,
            status: p.interview.status,
            notes: p.interview.notes ?? null,
            nextStep: p.interview.nextStep ?? null,
            createdAt: scheduledOn,
          },
        });
        events.push({ applicationId: id, actorType: ActorType.ADVISOR, actorId: advisorId, kind: 'INTERVIEW_SCHEDULED', payloadJson: { interviewId: iv.id, scheduledAt: scheduledAt.toISOString() }, createdAt: scheduledOn });
        if (p.interview.status !== 'SCHEDULED' && scheduledAt < new Date()) {
          events.push({
            applicationId: id, actorType: ActorType.ADVISOR, actorId: advisorId,
            kind: p.interview.status === 'COMPLETED' ? 'INTERVIEW_COMPLETED' : 'INTERVIEW_CANCELLED',
            payloadJson: { interviewId: iv.id, fields: ['status'] }, createdAt: hoursAfter(scheduledAt, 1),
          });
        }
      }
      if (completed && p.status !== ApplicationStatus.PENDING_REVIEW && advisorId) {
        const steps: ApplicationStatus[] =
          p.status === 'CONTACTED' ? ['CONTACTED']
            : p.status === 'INTERVIEW_SCHEDULED' ? ['INTERVIEW_SCHEDULED']
              : ['CONTACTED', 'CLOSED'];
        let from: ApplicationStatus = 'PENDING_REVIEW';
        steps.forEach((to, n) => {
          events.push({
            applicationId: id, actorType: ActorType.ADVISOR, actorId: advisorId, kind: 'STATUS_CHANGED',
            payloadJson: { from, to }, createdAt: to === 'CLOSED' ? hoursAfter(base, 7 * D) : hoursAfter(base, 2 + n),
          });
          from = to;
        });
      }
      await tx.activityEvent.createMany({ data: events.filter((e) => new Date(e.createdAt as Date) <= new Date()) });
    });
    created++;
  }
  return created;
}

async function main() {
  // Build de Render (SEED_IF_EMPTY=true): los datos ficticios sólo se cargan en una base nueva.
  // - Con usuarios: no escribe nada.
  // - Sin usuarios pero con datos (p. ej. se borró el admin para rotar la contraseña): sólo crea el admin.
  // Nunca sobrescribe: los upsert usan `update: {}` y los casos demo con id existente se saltean.
  if (process.env.SEED_IF_EMPTY === 'true') {
    const [users, questionnaires, applications] = await Promise.all([
      prisma.user.count(),
      prisma.questionnaire.count(),
      prisma.application.count(),
    ]);
    if (users > 0) {
      console.log(`Seed omitido: la base ya está inicializada (${users} usuario(s)). No se modificó nada.`);
      return;
    }
    if (questionnaires > 0 || applications > 0) {
      await seedUsers();
      console.log('Seed: base existente sin usuarios; sólo se creó el administrador (sin datos ficticios).');
      return;
    }
  }
  const advisorIds = await seedUsers();
  const questions = await seedQuestionnaire();
  // En producción los casos ficticios son opcionales (SEED_DEMO_DATA=true).
  const withDemo = !IS_PRODUCTION || process.env.SEED_DEMO_DATA === 'true';
  const created = withDemo ? await seedApplications(advisorIds, questions) : 0;
  const total = await prisma.application.count();
  console.log(
    `Seed OK (${IS_PRODUCTION ? 'producción' : 'desarrollo'}): ${new Set(advisorIds).size} usuario(s), cuestionario v1 publicado, ${created} solicitudes demo nuevas (${total} en total).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
