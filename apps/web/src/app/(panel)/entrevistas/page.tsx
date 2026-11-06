'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { ApplicationListItem, Interview, Paginated } from '@/lib/types';
import { formatDay } from '@/lib/utils';
import { InterviewCard, ScheduleInterviewForm } from '@/components/interview-forms';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, LoadingState, PageHeader, Tabs } from '@/components/ui';

type Filter = 'upcoming' | 'all' | 'COMPLETED' | 'CANCELLED';

export default function InterviewsPage() {
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => new Date().toISOString());

  const qs = new URLSearchParams();
  if (filter === 'upcoming') {
    qs.set('status', 'SCHEDULED');
    qs.set('from', now);
  } else if (filter !== 'all') qs.set('status', filter);

  const q = useQuery({ queryKey: ['interviews', qs.toString()], queryFn: () => api<Interview[]>(`/interviews?${qs}`) });
  const apps = useQuery({
    queryKey: ['applications', 'for-interviews'],
    queryFn: () => api<Paginated<ApplicationListItem>>('/applications?limit=100'),
    enabled: creating,
  });

  const groups = new Map<string, Interview[]>();
  for (const i of q.data ?? []) {
    const day = formatDay(i.scheduledAt);
    groups.set(day, [...(groups.get(day) ?? []), i]);
  }
  const ordered = filter === 'upcoming' ? [...groups] : [...groups].reverse();

  return (
    <>
      <PageHeader
        title="Entrevistas"
        description="Agenda de entrevistas con interesados."
        actions={
          <Button onClick={() => setCreating((v) => !v)} variant={creating ? 'outline' : 'default'}>
            <Plus /> {creating ? 'Cerrar' : 'Nueva entrevista'}
          </Button>
        }
      />
      {creating && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Nueva entrevista</CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleInterviewForm
              applications={apps.data?.items.filter((a) => a.status !== 'CLOSED' && a.status !== 'IN_PROGRESS') ?? []}
              onDone={() => setCreating(false)}
            />
          </CardContent>
        </Card>
      )}
      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: 'upcoming', label: 'Próximas' },
          { value: 'all', label: 'Todas' },
          { value: 'COMPLETED', label: 'Realizadas' },
          { value: 'CANCELLED', label: 'Canceladas' },
        ]}
      />
      <div className="mt-5">
        {q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <LoadingState />
        ) : q.data.length === 0 ? (
          <EmptyState title="No hay entrevistas en esta vista" description="Programá una desde la ficha de una solicitud o con «Nueva entrevista»." />
        ) : (
          <div className="flex flex-col gap-6">
            {ordered.map(([day, items]) => (
              <section key={day}>
                <h2 className="mb-2 text-sm font-semibold capitalize text-slate-600">{day}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {(filter === 'upcoming' ? items : [...items].reverse()).map((i) => (
                    <InterviewCard key={i.id} interview={i} showApplication />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
