'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock, CalendarDays, ChevronRight, ClipboardCheck, Inbox, MessageCircle, PhoneCall, Sparkles, TrendingUp, UserPlus,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Advisor, DashboardSummary } from '@/lib/types';
import { cn, formatDay, formatTime, timeAgo } from '@/lib/utils';
import { ActivityList } from '@/components/activity-list';
import { Avatar, ChannelTag, HandoffTag, Highlights, SectionCard, StatCard } from '@/components/commercial';
import { Button, ErrorState, Skeleton, buttonVariants } from '@/components/ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: Advisor }>('/auth/me'), staleTime: 60_000 });
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardSummary>('/dashboard/summary'), refetchInterval: 15_000 });
  const assign = useMutation({
    mutationFn: (id: string) => api(`/applications/${id}`, { method: 'PATCH', body: { assignedUserId: me.data?.user.id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const d = q.data;
  const k = d?.kpis;
  const delta = k ? k.newThisWeek - k.newPrevWeek : 0;
  const firstName = me.data?.user.displayName.split(' ')[0];

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-slate-600 first-letter:uppercase">
            {formatDay(new Date())}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Acciones rápidas">
          <Link href="/solicitudes?status=PENDING_REVIEW" className={buttonVariants()}>
            <ClipboardCheck /> Revisar pendientes
          </Link>
          <Link href="/entrevistas" className={buttonVariants({ variant: 'outline' })}>
            <CalendarDays /> Agenda
          </Link>
          <Link href="/simulador" target="_blank" className={buttonVariants({ variant: 'outline' })}>
            <MessageCircle /> Simulador
          </Link>
        </div>
      </div>

      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Nuevas (7 días)"
              icon={Sparkles}
              href="/solicitudes"
              loading={!k}
              value={k?.newThisWeek}
              testId="kpi-newThisWeek"
              hint={
                k && (
                  <span className={cn(delta > 0 && 'text-petrol-700', delta < 0 && 'text-rose-700')}>
                    {delta > 0 ? `+${delta}` : delta} vs. semana anterior
                  </span>
                )
              }
            />
            <StatCard
              label="Pendientes de revisión"
              icon={Inbox}
              href="/solicitudes?status=PENDING_REVIEW"
              tone={k && k.unassignedPending > 0 ? 'attention' : 'default'}
              loading={!k}
              value={k?.pendingReview}
              testId="kpi-pendingReview"
              hint={
                k &&
                [
                  k.unassignedPending > 0 ? `${k.unassignedPending} sin asesor asignado` : 'Todas asignadas',
                  k.handoffPending > 0 ? `${k.handoffPending} pidieron asesor` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }
            />
            <StatCard
              label="Entrevistas (7 días)"
              icon={CalendarClock}
              href="/entrevistas"
              loading={!k}
              value={k?.upcomingInterviews}
              testId="kpi-upcomingInterviews"
              hint="Programadas para esta semana"
            />
            <StatCard
              label="Finalización (30 días)"
              icon={TrendingUp}
              href="/solicitudes?view=abandoned"
              loading={!k}
              value={k ? (k.completionRate === null ? '—' : `${k.completionRate}%`) : null}
              testId="kpi-completionRate"
              hint={k && `${k.inProgress} en curso · ${k.abandonedRecoverable} para recuperar`}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <SectionCard
              className="lg:col-span-2"
              title="Para revisar"
              description="Solicitudes enviadas y pedidos de asesor que esperan el primer contacto."
              action={
                <Link href="/solicitudes?status=PENDING_REVIEW" className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
                  Ver todas
                </Link>
              }
              bodyClassName="px-2"
            >
              {!d ? (
                <ListSkeleton />
              ) : d.toReview.length === 0 ? (
                <Empty text="No hay solicitudes pendientes de revisión. ¡Todo al día!" />
              ) : (
                <ul className="flex flex-col" data-testid="to-review">
                  {d.toReview.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-slate-50">
                      <Avatar name={a.displayName} size="sm" />
                      <Link href={`/solicitudes/${a.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{a.displayName}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <ChannelTag channel={a.channel} />
                          <HandoffTag at={a.handoffRequestedAt} />
                          <Highlights items={a.highlights} />
                          {a.completedAt ? <span>Enviada {timeAgo(a.completedAt)}</span> : <span>Conversación sin terminar</span>}
                        </span>
                      </Link>
                      {a.assignedUser ? (
                        <span className="hidden text-xs text-slate-500 sm:block">{a.assignedUser.displayName}</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!me.data}
                          loading={assign.isPending && assign.variables === a.id}
                          onClick={() => assign.mutate(a.id)}
                        >
                          <UserPlus /> Asignarme
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Próximas entrevistas"
              action={
                <Link href="/entrevistas" className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
                  Agenda
                </Link>
              }
              bodyClassName="px-2"
            >
              {!d ? (
                <ListSkeleton />
              ) : d.upcomingInterviews.length === 0 ? (
                <Empty text="No hay entrevistas programadas." />
              ) : (
                <ul className="flex flex-col" data-testid="upcoming-interviews">
                  {d.upcomingInterviews.map((i) => (
                    <li key={i.id}>
                      <Link href={`/solicitudes/${i.application?.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-50">
                        <span className="flex w-14 shrink-0 flex-col items-center rounded-md bg-brand-50 py-1 text-brand-800">
                          <span className="text-[10px] font-medium uppercase">{formatDay(i.scheduledAt).slice(0, 3)}</span>
                          <span className="text-sm font-semibold tabular-nums">{formatTime(i.scheduledAt)}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{i.application?.displayName}</span>
                          <span className="block truncate text-xs text-slate-500 first-letter:uppercase">
                            {formatDay(i.scheduledAt)} · {i.advisor.displayName}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Embudo comercial" description="Últimos 30 días">
              {!d ? (
                <ListSkeleton />
              ) : (
                <ol className="flex flex-col gap-3" data-testid="funnel">
                  {d.funnel.map((f, i) => {
                    const top = d.funnel[0]!.count || 1;
                    const prev = i > 0 ? d.funnel[i - 1]!.count : null;
                    return (
                      <li key={f.key}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-slate-700">{f.label}</span>
                          <span className="font-semibold tabular-nums text-slate-900">
                            {f.count}
                            {prev ? (
                              <span className="ml-1.5 text-xs font-normal text-slate-500">{Math.round((f.count / prev) * 100)}%</span>
                            ) : null}
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-petrol-500" style={{ width: `${(f.count / top) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </SectionCard>

            <SectionCard
              title="Para recuperar"
              description="Conversaciones abandonadas con datos de contacto."
              action={
                <Link href="/solicitudes?view=abandoned" className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">
                  Ver todas
                </Link>
              }
              bodyClassName="px-2"
            >
              {!d ? (
                <ListSkeleton />
              ) : d.abandoned.length === 0 ? (
                <Empty text="No hay conversaciones abandonadas para recuperar." />
              ) : (
                <ul className="flex flex-col" data-testid="abandoned">
                  {d.abandoned.map((a) => (
                    <li key={a.id}>
                      <Link href={`/solicitudes/${a.id}`} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-50">
                        <PhoneCall className="size-4 shrink-0 text-slate-500" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{a.displayName}</span>
                          <span className="block text-xs text-slate-500">
                            {a.answerCount} respuesta{a.answerCount === 1 ? '' : 's'} · sin actividad {timeAgo(a.lastActivityAt)}
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-slate-400" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Actividad reciente">
              {!d ? (
                <ListSkeleton />
              ) : d.recentActivity.length === 0 ? (
                <Empty text="Sin actividad todavía." />
              ) : (
                <div className="max-h-80 overflow-y-auto pl-1 pr-1">
                  <ActivityList events={d.recentActivity} showApplication />
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-6 text-center text-sm text-slate-600">{text}</p>;
}
