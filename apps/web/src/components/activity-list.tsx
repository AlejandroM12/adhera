import Link from 'next/link';
import type { ActivityEvent } from '@/lib/types';
import { actorLabel, describeEvent } from '@/lib/labels';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';

const DOT: Record<ActivityEvent['actorType'], string> = {
  APPLICANT: 'bg-turq-400',
  ADVISOR: 'bg-petrol-500',
  SYSTEM: 'bg-slate-400',
};

export function ActivityList({ events, showApplication = false }: { events: ActivityEvent[]; showApplication?: boolean }) {
  return (
    <ol className="relative flex flex-col gap-4 border-l border-slate-200 pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className={cn('absolute -left-[26px] top-1.5 size-2.5 rounded-full ring-4 ring-white', DOT[e.actorType])} />
          <p className="text-sm text-slate-800">
            {showApplication && e.application && (
              <>
                <Link href={`/solicitudes/${e.application.id}`} className="font-medium text-petrol-700 hover:underline">
                  {e.application.displayName}
                </Link>
                {' · '}
              </>
            )}
            {describeEvent(e)}
          </p>
          <p className="text-xs text-slate-500" title={formatDateTime(e.createdAt)}>
            {actorLabel(e)} · {timeAgo(e.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
