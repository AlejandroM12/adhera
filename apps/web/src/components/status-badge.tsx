import { Badge } from '@/components/ui';
import { ABANDONED_STYLE, INTERVIEW_LABEL, INTERVIEW_STYLE, STATUS_LABEL, STATUS_STYLE } from '@/lib/labels';
import type { ApplicationStatus, InterviewStatus, Segment } from '@/lib/types';

/** Estado comercial; una conversación en curso sin actividad se muestra como "Abandonada". */
export function StatusBadge({ status, segment }: { status: ApplicationStatus; segment?: Segment }) {
  if (status === 'IN_PROGRESS' && segment === 'abandoned') {
    return <Badge className={ABANDONED_STYLE}>Abandonada</Badge>;
  }
  return <Badge className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function InterviewBadge({ status }: { status: InterviewStatus }) {
  return <Badge className={INTERVIEW_STYLE[status]}>{INTERVIEW_LABEL[status]}</Badge>;
}
