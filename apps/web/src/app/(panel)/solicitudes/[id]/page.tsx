'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, Bot, CalendarPlus, Check, Eye, EyeOff, Hand, Hourglass, MessageSquareText, PhoneCall, StickyNote,
} from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { ActivityEvent, ApplicationDetail, ApplicationStatus } from '@/lib/types';
import { CHANNEL_LABEL, DELIVERY_LABEL, STATUSES, STATUS_LABEL } from '@/lib/labels';
import { useAdvisors } from '@/lib/hooks';
import { formatDateTime, formatTime, timeAgo } from '@/lib/utils';
import { StatusBadge } from '@/components/status-badge';
import { ActivityList } from '@/components/activity-list';
import { Avatar, KeyValueGrid, SectionCard } from '@/components/commercial';
import { InterviewCard, ScheduleInterviewForm, useInvalidateAll } from '@/components/interview-forms';
import { Button, Card, EmptyState, ErrorState, Field, InlineError, LoadingState, Select, Tabs, Textarea } from '@/components/ui';

type Tab = 'perfil' | 'respuestas' | 'historial' | 'notas' | 'entrevistas';

export default function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>('perfil');
  const q = useQuery({ queryKey: ['application', id], queryFn: () => api<ApplicationDetail>(`/applications/${id}`) });
  const activity = useQuery({
    queryKey: ['activity', id],
    queryFn: () => api<ActivityEvent[]>(`/applications/${id}/activity`),
  });
  const name = q.data?.displayName;
  useEffect(() => {
    if (name) document.title = `${name} · Adhera`;
  }, [name]);

  if (q.isError) {
    return (
      <>
        <BackLink />
        {q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState title="La solicitud no existe" description="Puede que el enlace sea incorrecto." />
        ) : (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        )}
      </>
    );
  }
  if (!q.data) return (<><BackLink /><LoadingState rows={5} /></>);
  const app = q.data;
  const contact = app.profile.find((f) => f.key === 'contact_channel')?.value;
  const highlights = app.profile.filter((f) => f.key !== 'full_name' && !f.long && f.type !== 'yes_no').slice(0, 4);

  return (
    <>
      <BackLink />

      {/* Encabezado del perfil */}
      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={app.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900" data-testid="application-name">
                {app.displayName}
              </h1>
              <StatusBadge status={app.status} segment={app.segment} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {app.completedAt ? `Enviada ${formatDateTime(app.completedAt)}` : `Iniciada ${formatDateTime(app.createdAt)} · sin enviar`}
              {app.session && <> · Cuestionario v{app.session.questionnaire.version}</>} · Canal: {CHANNEL_LABEL[app.channel]}
            </p>
            {highlights.length > 0 && (
              <dl className="mt-3 hidden flex-wrap gap-x-6 gap-y-2 sm:flex">
                {highlights.map((h) => (
                  <div key={h.key}>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">{h.label}</dt>
                    <dd className="text-sm font-semibold text-petrol-900">{h.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </Card>

      {app.handoffRequestedAt && (
        <Banner tone="amber" icon={<Hand className="mt-0.5 size-4 shrink-0" />}>
          <strong>Pidió hablar con un asesor</strong> {timeAgo(app.handoffRequestedAt)}. El asistente pausó el cuestionario: contactalo
          {app.contact?.channel === 'WHATSAPP' ? ' por WhatsApp o teléfono' : ''} para continuar la atención.
        </Banner>
      )}
      {app.segment === 'abandoned' && (
        <Banner tone="rose" icon={<PhoneCall className="mt-0.5 size-4 shrink-0" />}>
          <strong>Conversación abandonada</strong> · sin actividad {timeAgo(app.lastActivityAt)} con {app.answers.length} respuesta
          {app.answers.length === 1 ? '' : 's'}.{' '}
          {contact ? `Oportunidad de recuperación: contactar por ${contact.toLowerCase()}.` : 'Asigná un asesor para intentar retomar el contacto.'}
        </Banner>
      )}
      {app.segment === 'in_progress' && (
        <Banner tone="amber" icon={<Hourglass className="mt-0.5 size-4 shrink-0" />}>
          El interesado está completando la conversación (última respuesta {timeAgo(app.lastActivityAt)}). Los datos se actualizan solos.
        </Banner>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'perfil', label: 'Perfil' },
              { value: 'respuestas', label: 'Respuestas originales', count: app.answers.length },
              { value: 'historial', label: 'Historial', count: activity.data?.length },
              { value: 'notas', label: 'Notas', count: app.notes.length },
              { value: 'entrevistas', label: 'Entrevistas', count: app.interviews.length },
            ]}
          />
          <div className="mt-4">
            {tab === 'perfil' && <ProfileTab app={app} onGo={setTab} />}
            {tab === 'respuestas' && <AnswersTab app={app} />}
            {tab === 'historial' &&
              (activity.isError ? (
                <ErrorState message={errorMessage(activity.error)} onRetry={() => activity.refetch()} />
              ) : !activity.data ? (
                <LoadingState />
              ) : (
                <Card className="p-5">
                  <ActivityList events={activity.data} />
                </Card>
              ))}
            {tab === 'notas' && <NotesTab app={app} />}
            {tab === 'entrevistas' && <InterviewsTab app={app} />}
          </div>
        </div>
        <aside className="flex flex-col gap-4" aria-label="Gestión comercial">
          <Management app={app} />
          {app.contact && <ContactCard contact={app.contact} />}
          <NextSteps app={app} onGo={setTab} />
        </aside>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/solicitudes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-petrol-700">
      <ArrowLeft className="size-4" /> Solicitudes
    </Link>
  );
}

function Banner({ tone, icon, children }: { tone: 'rose' | 'amber'; icon: React.ReactNode; children: React.ReactNode }) {
  const styles = { rose: 'bg-rose-50 text-rose-900 ring-rose-200', amber: 'bg-amber-50 text-amber-900 ring-amber-200' };
  return (
    <div role="status" className={`mb-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm ring-1 ${styles[tone]}`}>
      {icon}
      <p>{children}</p>
    </div>
  );
}

function Management({ app }: { app: ApplicationDetail }) {
  const advisors = useAdvisors();
  const invalidate = useInvalidateAll();
  const [saved, setSaved] = useState(false);
  const m = useMutation({
    mutationFn: (body: { status?: ApplicationStatus; assignedUserId?: string | null }) =>
      api(`/applications/${app.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      invalidate();
      setSaved(true);
    },
  });
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);
  // Una solicitud enviada no puede volver a "En curso".
  const statusOptions = STATUSES.filter((s) => s !== 'IN_PROGRESS' || app.status === 'IN_PROGRESS');
  return (
    <SectionCard
      title="Gestión"
      action={
        saved ? (
          <span role="status" className="flex items-center gap-1 text-xs text-turq-700">
            <Check className="size-3.5" /> Guardado
          </span>
        ) : null
      }
      bodyClassName="flex flex-col gap-3"
    >
      <Field label="Estado" htmlFor="app-status">
        <Select id="app-status" value={app.status} disabled={m.isPending} onChange={(e) => m.mutate({ status: e.target.value as ApplicationStatus })}>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s === 'IN_PROGRESS' && app.segment === 'abandoned' ? 'Abandonada (sin enviar)' : STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Asesor responsable" htmlFor="app-advisor">
        <Select
          id="app-advisor"
          value={app.assignedUser?.id ?? ''}
          disabled={m.isPending}
          onChange={(e) => m.mutate({ assignedUserId: e.target.value || null })}
        >
          <option value="">Sin asignar</option>
          {advisors.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <InlineError message={m.isError ? errorMessage(m.error) : null} />
    </SectionCard>
  );
}

/** Contacto del canal externo. El número se muestra sólo a pedido del asesor. */
function ContactCard({ contact }: { contact: NonNullable<ApplicationDetail['contact']> }) {
  const [show, setShow] = useState(false);
  const masked = contact.phone.replace(/\d(?=\d{4})/g, '•');
  const delivery = contact.lastDelivery;
  const windowOpen = contact.lastInboundAt && Date.now() - new Date(contact.lastInboundAt).getTime() < 24 * 3600 * 1000;
  return (
    <SectionCard title="Contacto" description={`Canal: ${CHANNEL_LABEL[contact.channel]}`} bodyClassName="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono tabular-nums text-slate-900" data-testid="contact-phone">
          +{show ? contact.phone : masked}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar número' : 'Mostrar número'}>
          {show ? <EyeOff /> : <Eye />} {show ? 'Ocultar' : 'Mostrar'}
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Consentimiento</dt>
          <dd className="font-medium text-slate-800">{contact.consentAt ? formatDateTime(contact.consentAt) : 'Pendiente'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Último mensaje</dt>
          <dd className="font-medium text-slate-800">{contact.lastInboundAt ? timeAgo(contact.lastInboundAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Último envío</dt>
          <dd className={delivery?.status === 'FAILED' ? 'font-medium text-rose-700' : 'font-medium text-slate-800'} data-testid="last-delivery">
            {delivery ? `${DELIVERY_LABEL[delivery.status]}${delivery.errorCode ? ` (${delivery.errorCode})` : ''}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Ventana 24 h</dt>
          <dd className="font-medium text-slate-800">{windowOpen ? 'Abierta' : 'Cerrada'}</dd>
        </div>
      </dl>
      {contact.optedOut && <p className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-800">Pidió no recibir más mensajes.</p>}
    </SectionCard>
  );
}

function NextSteps({ app, onGo }: { app: ApplicationDetail; onGo: (t: Tab) => void }) {
  const upcoming = app.interviews
    .filter((i) => i.status === 'SCHEDULED' && new Date(i.scheduledAt) > new Date())
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const lastNote = app.notes[0];
  return (
    <SectionCard title="Seguimiento" bodyClassName="flex flex-col gap-4">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <CalendarPlus className="size-3.5" /> Próxima entrevista
        </p>
        {upcoming ? (
          <p className="mt-1 text-sm text-slate-900">
            {formatDateTime(upcoming.scheduledAt)} · {upcoming.advisor.displayName}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Sin entrevistas programadas.</p>
        )}
        <Button size="sm" variant="outline" className="mt-2" onClick={() => onGo('entrevistas')}>
          {upcoming ? 'Ver entrevistas' : 'Agendar entrevista'}
        </Button>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <StickyNote className="size-3.5" /> Última nota
        </p>
        {lastNote ? (
          <>
            <p className="mt-1 line-clamp-3 text-sm text-slate-800">{lastNote.content}</p>
            <p className="mt-1 text-xs text-slate-500">
              {lastNote.author.displayName} · {timeAgo(lastNote.createdAt)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Sin notas.</p>
        )}
        <Button size="sm" variant="outline" className="mt-2" onClick={() => onGo('notas')}>
          {app.notes.length ? 'Ver notas' : 'Agregar nota'}
        </Button>
      </div>
    </SectionCard>
  );
}

function ProfileTab({ app, onGo }: { app: ApplicationDetail; onGo: (t: Tab) => void }) {
  const fields = app.profile.filter((f) => f.key !== 'full_name');
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Bot className="size-4 text-turq-600" /> Perfil comercial
        </span>
      }
      description="Resumen automático generado a partir de las respuestas. No infiere datos ausentes ni evalúa elegibilidad."
    >
      {fields.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay datos suficientes para armar el perfil.</p>
      ) : (
        <KeyValueGrid testId="summary" items={fields.map((f) => ({ key: f.key, label: f.label, value: f.value, long: f.long }))} />
      )}
      <button onClick={() => onGo('respuestas')} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-petrol-700 hover:underline">
        <MessageSquareText className="size-4" /> Ver respuestas originales <ArrowRight className="size-3.5" />
      </button>
    </SectionCard>
  );
}

function AnswersTab({ app }: { app: ApplicationDetail }) {
  if (app.answers.length === 0) {
    return <EmptyState title="Sin respuestas" description="El interesado todavía no respondió ninguna pregunta." />;
  }
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        Pregunta y respuesta tal como ocurrieron en la conversación {app.session && `(cuestionario v${app.session.questionnaire.version})`}. No
        son editables.
      </p>
      <ol className="divide-y divide-slate-100" data-testid="answers">
        {app.answers.map((a, i) => (
          <li
            key={a.questionKey}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[2rem_1fr_1fr_auto] sm:items-baseline sm:gap-4"
            data-testid={`answer-row-${a.questionKey}`}
          >
            <span className="text-xs tabular-nums text-slate-400">{i + 1}.</span>
            <span className="text-sm text-slate-600">{a.label}</span>
            <span className="text-sm font-medium text-slate-900" data-testid="answer-value">
              {a.display}
              {a.rawText && a.rawText !== a.display && a.type === 'text' && (
                <span className="block text-xs font-normal text-slate-500">Texto original: {a.rawText}</span>
              )}
            </span>
            <span className="text-xs text-slate-400" title={formatDateTime(a.answeredAt)}>
              {formatTime(a.answeredAt)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function NotesTab({ app }: { app: ApplicationDetail }) {
  const [content, setContent] = useState('');
  const invalidate = useInvalidateAll();
  const m = useMutation({
    mutationFn: () => api(`/applications/${app.id}/notes`, { method: 'POST', body: { content } }),
    onSuccess: () => {
      setContent('');
      invalidate();
    },
  });
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (content.trim()) m.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <Field label="Nueva nota interna" htmlFor="note">
            <Textarea id="note" value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} placeholder="Visible sólo para asesores" />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" loading={m.isPending} disabled={!content.trim()}>
              Guardar nota
            </Button>
            <InlineError message={m.isError ? errorMessage(m.error) : null} />
          </div>
        </form>
      </Card>
      <div className="flex flex-col gap-3" data-testid="notes">
        {app.notes.length === 0 ? (
          <EmptyState title="Sin notas" description="Registrá lo conversado con el interesado." />
        ) : (
          app.notes.map((n) => (
            <Card key={n.id} className="flex gap-3 p-4">
              <Avatar name={n.author.displayName} size="sm" />
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{n.author.displayName}</span> · {formatDateTime(n.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.content}</p>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function InterviewsTab({ app }: { app: ApplicationDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Programar entrevista">
        <ScheduleInterviewForm applicationId={app.id} />
      </SectionCard>
      <div className="flex flex-col gap-3">
        {app.interviews.length === 0 ? (
          <EmptyState title="Sin entrevistas" description="Programá la primera entrevista con este interesado." />
        ) : (
          app.interviews.map((i) => <InterviewCard key={i.id} interview={i} />)
        )}
      </div>
    </div>
  );
}
