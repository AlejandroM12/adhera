'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import type { Interview, InterviewStatus } from '@/lib/types';
import { INTERVIEW_LABEL } from '@/lib/labels';
import { useAdvisors } from '@/lib/hooks';
import { formatDateTime, toLocalInput } from '@/lib/utils';
import { Button, Card, Field, InlineError, Input, Select, Textarea } from '@/components/ui';
import { InterviewBadge } from '@/components/status-badge';

function defaultSlot() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d);
}

/** Invalida todo lo que depende de entrevistas/solicitudes. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['application', 'applications', 'interviews', 'dashboard', 'activity']) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function ScheduleInterviewForm({
  applicationId,
  applications,
  onDone,
}: {
  applicationId?: string;
  applications?: { id: string; displayName: string }[];
  onDone?: () => void;
}) {
  const advisors = useAdvisors();
  const invalidate = useInvalidateAll();
  const [appId, setAppId] = useState(applicationId ?? '');
  const [when, setWhen] = useState(defaultSlot);
  const [advisorId, setAdvisorId] = useState('');
  const [notes, setNotes] = useState('');
  const m = useMutation({
    mutationFn: () =>
      api<Interview>('/interviews', {
        method: 'POST',
        body: {
          applicationId: appId,
          scheduledAt: new Date(when).toISOString(),
          ...(advisorId ? { advisorId } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      }),
    onSuccess: () => {
      invalidate();
      setNotes('');
      onDone?.();
    },
  });

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      {applications && (
        <Field label="Solicitud" htmlFor="iv-app">
          <Select id="iv-app" value={appId} onChange={(e) => setAppId(e.target.value)} required>
            <option value="">Elegí una solicitud…</option>
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Fecha y hora" htmlFor="iv-when">
        <Input id="iv-when" type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} required />
      </Field>
      <Field label="Asesor" htmlFor="iv-adv">
        <Select id="iv-adv" value={advisorId} onChange={(e) => setAdvisorId(e.target.value)}>
          <option value="">Yo</option>
          {advisors.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Observaciones (opcional)" htmlFor="iv-notes">
          <Textarea id="iv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Ej.: videollamada, confirmar el día anterior" />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" loading={m.isPending} disabled={!appId || !when}>
          Programar entrevista
        </Button>
        <InlineError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </form>
  );
}

export function InterviewCard({ interview, showApplication }: { interview: Interview; showApplication?: boolean }) {
  const invalidate = useInvalidateAll();
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(toLocalInput(interview.scheduledAt));
  const [status, setStatus] = useState<InterviewStatus>(interview.status);
  const [notes, setNotes] = useState(interview.notes ?? '');
  const [nextStep, setNextStep] = useState(interview.nextStep ?? '');

  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Interview>(`/interviews/${interview.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
  });

  return (
    <Card className="p-4" data-testid="interview-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">
            {formatDateTime(interview.scheduledAt)}
            {showApplication && interview.application && (
              <>
                {' · '}
                <Link href={`/solicitudes/${interview.application.id}`} className="text-petrol-700 hover:underline">
                  {interview.application.displayName}
                </Link>
              </>
            )}
          </p>
          <p className="text-xs text-slate-500">Asesor: {interview.advisor.displayName}</p>
        </div>
        <InterviewBadge status={interview.status} />
      </div>
      {!editing && (
        <>
          {interview.notes && <p className="mt-2 text-sm text-slate-700">{interview.notes}</p>}
          {interview.nextStep && (
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-medium">Próximo paso:</span> {interview.nextStep}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Partir siempre de los valores actuales (pudieron cambiar con las acciones rápidas).
                setWhen(toLocalInput(interview.scheduledAt));
                setStatus(interview.status);
                setNotes(interview.notes ?? '');
                setNextStep(interview.nextStep ?? '');
                setEditing(true);
              }}
            >
              Editar
            </Button>
            {interview.status === 'SCHEDULED' && (
              <>
                <Button size="sm" variant="outline" loading={m.isPending} onClick={() => m.mutate({ status: 'COMPLETED' })}>
                  Marcar realizada
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-700" loading={m.isPending} onClick={() => {
                    if (window.confirm('¿Cancelar esta entrevista?')) m.mutate({ status: 'CANCELLED' });
                  }}>
                  Cancelar
                </Button>
              </>
            )}
          </div>
        </>
      )}
      {editing && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate({ scheduledAt: new Date(when).toISOString(), status, notes: notes.trim() || null, nextStep: nextStep.trim() || null });
          }}
        >
          <Field label="Fecha y hora" htmlFor={`iv-${interview.id}-when`}>
            <Input id={`iv-${interview.id}-when`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </Field>
          <Field label="Estado" htmlFor={`iv-${interview.id}-status`}>
            <Select id={`iv-${interview.id}-status`} value={status} onChange={(e) => setStatus(e.target.value as InterviewStatus)}>
              {(Object.keys(INTERVIEW_LABEL) as InterviewStatus[]).map((s) => (
                <option key={s} value={s}>
                  {INTERVIEW_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Observaciones / resultado" htmlFor={`iv-${interview.id}-notes`}>
              <Textarea id={`iv-${interview.id}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Próximo paso" htmlFor={`iv-${interview.id}-next`}>
              <Input id={`iv-${interview.id}-next`} value={nextStep} onChange={(e) => setNextStep(e.target.value)} maxLength={500} placeholder="Ej.: enviar propuesta" />
            </Field>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" loading={m.isPending}>
              Guardar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Descartar
            </Button>
          </div>
        </form>
      )}
      <InlineError message={m.isError ? errorMessage(m.error) : null} />
    </Card>
  );
}
