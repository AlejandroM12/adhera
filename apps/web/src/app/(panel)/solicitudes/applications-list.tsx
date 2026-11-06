'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Info, MessageCircle, Search, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { ApplicationListItem, ApplicationsPage } from '@/lib/types';
import { STATUS_LABEL, SUBMITTED_STATUSES } from '@/lib/labels';
import { useAdvisors, useDebounced } from '@/lib/hooks';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { StatusBadge } from '@/components/status-badge';
import { Avatar, ChannelTag, HandoffTag, Highlights } from '@/components/commercial';
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select, Tabs, buttonVariants } from '@/components/ui';

const LIMIT = 15;
type View = 'submitted' | 'in_progress' | 'abandoned' | 'all';
const VIEWS: View[] = ['submitted', 'in_progress', 'abandoned', 'all'];

const VIEW_HELP: Record<View, string> = {
  submitted: 'Solicitudes enviadas por el interesado y en gestión comercial.',
  in_progress: 'Conversaciones que el interesado está completando ahora (actividad en las últimas 24 h).',
  abandoned: 'Conversaciones sin actividad hace más de 24 h. Si dejaron datos, se pueden recuperar con un contacto.',
  all: 'Todas las solicitudes y conversaciones.',
};

const EMPTY_TEXT: Record<View, { title: string; description: string }> = {
  submitted: { title: 'Todavía no hay solicitudes enviadas', description: 'Completá una conversación en el simulador para crear la primera.' },
  in_progress: { title: 'No hay conversaciones en curso', description: 'Cuando alguien esté respondiendo en el simulador, aparecerá acá.' },
  abandoned: { title: 'No hay conversaciones abandonadas', description: 'Las conversaciones sin actividad por más de 24 h se listan acá para recuperarlas.' },
  all: { title: 'Todavía no hay solicitudes', description: 'Completá una conversación en el simulador para crear la primera.' },
};

/** Compatibilidad con enlaces anteriores (?status=ALL, ?status=IN_PROGRESS). */
function readView(params: URLSearchParams): View {
  const v = params.get('view') as View | null;
  if (v && VIEWS.includes(v)) return v;
  if (params.get('status') === 'ALL') return 'all';
  if (params.get('status') === 'IN_PROGRESS') return 'in_progress';
  return 'submitted';
}

export function ApplicationsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = readView(params);
  const rawStatus = params.get('status') ?? '';
  const status = SUBMITTED_STATUSES.includes(rawStatus as never) && (view === 'submitted' || view === 'all') ? rawStatus : '';
  const advisor = params.get('advisor') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search);
  const advisors = useAdvisors();

  function setParam(updates: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in updates)) next.delete('page');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) setParam({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT), view });
  if (status) qs.set('status', status);
  if (advisor) qs.set('assignedUserId', advisor);
  if (debounced) qs.set('search', debounced);

  const q = useQuery({
    queryKey: ['applications', qs.toString()],
    queryFn: () => api<ApplicationsPage>(`/applications?${qs}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / LIMIT)) : 1;
  const filtered = Boolean(status || advisor || debounced);
  const seg = q.data?.segments;

  return (
    <>
      <PageHeader
        title="Solicitudes"
        description="Seguimiento de interesados desde la conversación hasta la entrevista."
        actions={
          <Link href="/simulador" target="_blank" className={buttonVariants({ variant: 'outline' })}>
            <MessageCircle /> Nueva desde simulador
          </Link>
        }
      />

      <Tabs<View>
        value={view}
        onChange={(v) => setParam({ view: v === 'submitted' ? '' : v, status: '' })}
        tabs={[
          { value: 'submitted', label: 'Enviadas', count: seg?.submitted },
          { value: 'in_progress', label: 'En curso', count: seg?.in_progress },
          { value: 'abandoned', label: 'Abandonadas', count: seg?.abandoned },
          { value: 'all', label: 'Todas', count: seg?.all },
        ]}
      />
      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
        <Info className="mt-px size-3.5 shrink-0" /> {VIEW_HELP[view]}
      </p>

      <Card className="mb-4 mt-3 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Buscar por nombre" placeholder="Buscar por nombre…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(view === 'submitted' || view === 'all') && (
          <Select aria-label="Filtrar por estado" value={status} onChange={(e) => setParam({ status: e.target.value })} className="sm:w-52">
            <option value="">Todos los estados</option>
            {SUBMITTED_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Filtrar por asesor" value={advisor} onChange={(e) => setParam({ advisor: e.target.value })} className="sm:w-48">
          <option value="">Todos los asesores</option>
          <option value="none">Sin asignar</option>
          {advisors.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </Select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setParam({ status: '', advisor: '', q: '' });
            }}
          >
            <X /> Limpiar
          </Button>
        )}
      </Card>

      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <LoadingState rows={6} />
      ) : q.data.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No hay resultados con esos filtros' : EMPTY_TEXT[view].title}
          description={filtered ? 'Probá con otros filtros o limpiá la búsqueda.' : EMPTY_TEXT[view].description}
        />
      ) : (
        <>
          {/* Tabla desktop */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm" data-testid="applications-table">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Interesado</th>
                  <th className="px-4 py-3 font-medium">{view === 'submitted' ? 'Enviada' : 'Actividad'}</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Asesor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data.items.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-petrol-50/50" onClick={() => router.push(`/solicitudes/${a.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.displayName} size="sm" />
                        <div className="min-w-0">
                          <Link href={`/solicitudes/${a.id}`} className="font-medium text-slate-900 hover:text-petrol-700" onClick={(e) => e.stopPropagation()}>
                            {a.displayName}
                          </Link>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1">
                            <ChannelTag channel={a.channel} />
                            <HandoffTag at={a.handoffRequestedAt} />
                            <Highlights items={a.highlights} />
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <ActivityCell a={a} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} segment={a.segment} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{a.assignedUser?.displayName ?? <span className="text-slate-400">Sin asignar</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Tarjetas mobile */}
          <div className="flex flex-col gap-2 md:hidden">
            {q.data.items.map((a) => (
              <Link key={a.id} href={`/solicitudes/${a.id}`}>
                <Card className="flex gap-3 p-4">
                  <Avatar name={a.displayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium text-slate-900">{a.displayName}</p>
                      <StatusBadge status={a.status} segment={a.segment} />
                    </div>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <ChannelTag channel={a.channel} />
                      <HandoffTag at={a.handoffRequestedAt} />
                      <Highlights items={a.highlights} />
                    </span>
                    <p className="mt-1 text-xs text-slate-500">
                      {a.completedAt ? `Enviada ${timeAgo(a.completedAt)}` : `Última actividad ${timeAgo(a.lastActivityAt)}`} ·{' '}
                      {a.assignedUser?.displayName ?? 'Sin asignar'}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>
                Página {page} de {pages} · {q.data.total} resultados
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
                  <ChevronLeft /> Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
                  Siguiente <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ActivityCell({ a }: { a: ApplicationListItem }) {
  if (a.completedAt) {
    return (
      <>
        {formatDateTime(a.completedAt)}
        <p className="text-xs text-slate-400">{timeAgo(a.completedAt)}</p>
      </>
    );
  }
  return (
    <>
      <span className={a.segment === 'abandoned' ? 'text-rose-700' : 'text-slate-700'}>
        {a.segment === 'abandoned' ? 'Sin actividad' : 'Respondiendo'} · {timeAgo(a.lastActivityAt)}
      </span>
      <p className="text-xs text-slate-400">
        {a.answerCount} respuesta{a.answerCount === 1 ? '' : 's'} · sin enviar
      </p>
    </>
  );
}
