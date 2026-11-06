import { ApplicationStatus, Prisma } from '@prisma/client';

/** Horas sin actividad del interesado para considerar abandonada una conversación. */
export const ABANDON_AFTER_HOURS = 24;

export type Segment = 'submitted' | 'in_progress' | 'abandoned';

export const abandonCutoff = (now = new Date()) => new Date(now.getTime() - ABANDON_AFTER_HOURS * 3600 * 1000);

/**
 * Abandonada = sigue "En curso", empezó antes del corte y no respondió nada desde entonces.
 * Se deriva de las respuestas (sin columnas extra), así asignar o anotar no "reactiva" el reloj.
 */
export function abandonedWhere(cutoff = abandonCutoff()): Prisma.ApplicationWhereInput {
  return {
    status: ApplicationStatus.IN_PROGRESS,
    sessions: { some: { startedAt: { lt: cutoff }, answers: { none: { createdAt: { gte: cutoff } } } } },
  };
}

export function segmentWhere(segment: Segment | 'all', cutoff = abandonCutoff()): Prisma.ApplicationWhereInput {
  switch (segment) {
    case 'submitted':
      return { status: { not: ApplicationStatus.IN_PROGRESS } };
    case 'abandoned':
      return abandonedWhere(cutoff);
    case 'in_progress':
      return { status: ApplicationStatus.IN_PROGRESS, NOT: abandonedWhere(cutoff) };
    default:
      return {};
  }
}

/** Última actividad del interesado: su última respuesta o el inicio de la conversación. */
export function lastApplicantActivity(startedAt: Date | undefined, answerDates: Date[], fallback: Date): Date {
  const times = [startedAt?.getTime() ?? fallback.getTime(), ...answerDates.map((d) => d.getTime())];
  return new Date(Math.max(...times));
}

export function segmentOf(status: ApplicationStatus, lastActivity: Date, cutoff = abandonCutoff()): Segment {
  if (status !== ApplicationStatus.IN_PROGRESS) return 'submitted';
  return lastActivity < cutoff ? 'abandoned' : 'in_progress';
}
