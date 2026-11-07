import type { ActivityEvent, ApplicationStatus, InterviewStatus, Segment } from './types';

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  IN_PROGRESS: 'En curso',
  PENDING_REVIEW: 'Pendiente de revisión',
  CONTACTED: 'Contactado',
  INTERVIEW_SCHEDULED: 'Entrevista programada',
  CLOSED: 'Cerrada',
};

export const STATUS_STYLE: Record<ApplicationStatus, string> = {
  IN_PROGRESS: 'bg-slate-50 text-slate-700 ring-slate-200',
  PENDING_REVIEW: 'bg-amber-50 text-amber-900 ring-amber-200',
  CONTACTED: 'bg-brand-50 text-brand-800 ring-brand-200',
  INTERVIEW_SCHEDULED: 'bg-petrol-50 text-petrol-800 ring-petrol-200',
  CLOSED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const STATUSES = Object.keys(STATUS_LABEL) as ApplicationStatus[];

/** Estados elegibles para solicitudes enviadas (el resto es "En curso"). */
export const SUBMITTED_STATUSES = STATUSES.filter((s) => s !== 'IN_PROGRESS');

export const SEGMENT_LABEL: Record<Segment, string> = {
  submitted: 'Enviadas',
  in_progress: 'En curso',
  abandoned: 'Abandonadas',
};

export const ABANDONED_STYLE = 'bg-rose-50 text-rose-800 ring-rose-200';

export const CHANNEL_LABEL = { SIMULATOR: 'Simulador', WHATSAPP: 'WhatsApp' } as const;

export const DELIVERY_LABEL = {
  PENDING: 'Enviando',
  SENT: 'Enviado',
  DELIVERED: 'Entregado',
  READ: 'Leído',
  FAILED: 'No entregado',
  SKIPPED: 'No enviado',
} as const;

export const INTERVIEW_LABEL: Record<InterviewStatus, string> = {
  SCHEDULED: 'Programada',
  COMPLETED: 'Realizada',
  CANCELLED: 'Cancelada',
};

export const INTERVIEW_STYLE: Record<InterviewStatus, string> = {
  SCHEDULED: 'bg-petrol-50 text-petrol-800 ring-petrol-200',
  COMPLETED: 'bg-brand-50 text-brand-800 ring-brand-200',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const QUESTION_TYPE_LABEL = {
  text: 'Texto',
  single_choice: 'Opción única',
  number: 'Número',
  yes_no: 'Sí / No',
  date: 'Fecha',
  multi_choice: 'Opción múltiple',
  dni: 'DNI',
  phone: 'Teléfono',
  email: 'Correo',
  locality: 'Localidad (catálogo)',
} as const;

/** Tipos que el administrador puede elegir al crear una pregunta; el resto los define una plantilla. */
export const EDITABLE_QUESTION_TYPES = ['text', 'single_choice', 'number', 'yes_no', 'date'] as const;

/** Descripción legible de un evento de actividad (sin exponer contenido de respuestas). */
export function describeEvent(e: ActivityEvent): string {
  const p = e.payloadJson ?? {};
  switch (e.kind) {
    case 'SESSION_STARTED':
      return `Inició la conversación${p.channel === 'WHATSAPP' ? ' por WhatsApp' : ''} (cuestionario v${p.version ?? '?'})`;
    case 'HANDOFF_REQUESTED':
      return 'Pidió hablar con un asesor';
    case 'ANSWER_RECORDED':
      return `Respondió «${(p.questionLabel as string | undefined) ?? p.questionKey}»`;
    case 'SESSION_COMPLETED':
      return 'Finalizó la conversación';
    case 'STATUS_CHANGED':
      return `Estado: ${STATUS_LABEL[p.from as ApplicationStatus] ?? p.from} → ${STATUS_LABEL[p.to as ApplicationStatus] ?? p.to}`;
    case 'ASSIGNED':
      return p.assignedUserId ? 'Asignó un asesor responsable' : 'Quitó la asignación';
    case 'NOTE_ADDED':
      return p.kind === 'CLARIFICATION' ? 'Marcó una aclaración pendiente' : p.kind === 'OBSERVATION' ? 'Agregó una observación' : 'Agregó una nota interna';
    case 'CLARIFICATION_RESOLVED':
      return 'Resolvió una aclaración';
    case 'ANSWER_CORRECTED':
      return `Corrigió «${(p.questionLabel as string | undefined) ?? p.questionKey}»`;
    case 'PDF_EXPORTED':
      return 'Descargó la ficha en PDF';
    case 'INTERVIEW_SCHEDULED':
      return 'Programó una entrevista';
    case 'INTERVIEW_UPDATED':
      return 'Actualizó una entrevista';
    case 'INTERVIEW_COMPLETED':
      return 'Marcó una entrevista como realizada';
    case 'INTERVIEW_CANCELLED':
      return 'Canceló una entrevista';
    default:
      return 'Actualizó la solicitud';
  }
}

export function actorLabel(e: ActivityEvent): string {
  if (e.actorType === 'APPLICANT') return 'Interesado';
  if (e.actorType === 'SYSTEM') return 'Sistema';
  return e.actorName ?? 'Asesor';
}
