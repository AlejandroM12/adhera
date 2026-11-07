'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, CircleHelp, FileText, History, Info, MessageSquarePlus, UserRound,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { ApplicationDetail, Dossier, DossierItem, DossierMember, DossierSection, Note, NoteKind, ReviewFlag } from '@/lib/types';
import { cn, formatDateTime } from '@/lib/utils';
import { Badge, Button, Card, InlineError, Select, Textarea, buttonVariants } from '@/components/ui';
import { useInvalidateAll } from '@/components/interview-forms';

const anchor = (stepId: string) => `step-${stepId.replace('#', '-')}`;
const sectionId = (i: number) => `ficha-seccion-${i}`;
const memberId = (id: string) => `ficha-persona-${id}`;
const formatDni = (dni: string) => (/^\d+$/.test(dni) ? dni.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : dni);

const STATUS_BADGE: Record<DossierItem['status'], { label: string; className: string } | null> = {
  answered: null,
  skipped: { label: 'Omitida', className: 'bg-slate-50 text-slate-600 ring-slate-200' },
  unknown: { label: 'No sé', className: 'bg-amber-50 text-amber-900 ring-amber-200' },
  prefer_not: { label: 'Prefirió no responder', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  to_verify: { label: 'A verificar', className: 'bg-amber-50 text-amber-900 ring-amber-200' },
};

/** Aviso permanente: la preentrevista no es una declaración jurada ni una evaluación. */
export function PreinterviewNotice({ app }: { app: ApplicationDetail }) {
  const consent = app.session?.consentAt;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[13px] text-slate-700" data-testid="preinterview-notice">
      <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
      <p>
        <strong className="font-semibold text-slate-900">Preentrevista, no declaración jurada.</strong> Datos declarados por el interesado para
        preparar la entrevista; no es una evaluación médica ni un diagnóstico.
        {consent ? ` Consentimiento registrado ${formatDateTime(consent)}.` : ' Sin consentimiento registrado (conversación sin finalizar).'}
        {' '}<span className="text-slate-500">Demo: datos ficticios.</span>
      </p>
    </div>
  );
}

const FLAG_TONE = {
  amber: 'border-amber-200 bg-amber-50 text-amber-950',
  rose: 'border-rose-200 bg-rose-50 text-rose-950',
  brand: 'border-brand-200 bg-brand-50 text-brand-950',
} as const;

/** Lista de puntos a revisar. Vacía, se muestra neutra y compacta para no competir con lo pendiente. */
function FlagList({ title, icon, flags, tone, testId, compact }: { title: string; icon: React.ReactNode; flags: ReviewFlag[]; tone: keyof typeof FLAG_TONE; testId: string; compact?: boolean }) {
  const empty = flags.length === 0;
  return (
    <div className={cn('rounded-md border', compact ? 'px-2.5 py-2' : 'p-3', empty ? 'border-slate-200 bg-white text-slate-600' : FLAG_TONE[tone])} data-testid={testId}>
      <p className={cn('flex items-center gap-1.5 font-semibold', compact ? 'text-xs' : 'text-sm')}>
        <span className={cn('hidden sm:inline', empty && 'text-slate-400')}>{icon}</span> {title}
        <span className={cn('ml-auto rounded px-1.5 text-xs tabular-nums', empty ? 'bg-slate-100' : 'bg-white/80')}>{flags.length}</span>
      </p>
      {empty ? (
        !compact && <p className="mt-0.5 text-xs">Nada para revisar.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
          {flags.map((f, i) => (
            <li key={`${f.stepId}-${i}`}>
              {f.stepId ? (
                <a href={`#${anchor(f.stepId)}`} className="font-medium underline underline-offset-2 hover:no-underline">{f.label}</a>
              ) : (
                <span className="font-medium">{f.label}</span>
              )}
              <span className="block opacity-90">{f.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Resumen para la entrevista: faltantes, contradicciones explícitas y aclaraciones pendientes. */
export function ReviewSummary({ dossier }: { dossier: Dossier }) {
  const r = dossier.review;
  const pending = r.missing.length + r.contradictions.length + r.clarifications.length;
  return (
    <section aria-labelledby="para-revisar" className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="para-revisar" className="text-[15px] font-semibold text-slate-900">
          Para revisar en la entrevista
          {pending > 0 && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">{pending}</span>}
        </h2>
        <p className="text-xs text-slate-600">Sólo datos declarados: sin puntajes ni interpretaciones clínicas.</p>
      </div>
      <div className={cn('grid gap-2', pending === 0 ? 'grid-cols-3' : 'md:grid-cols-3')}>
        <FlagList title="Datos faltantes" icon={<CircleHelp className="size-4" aria-hidden />} flags={r.missing} tone="amber" testId="review-missing" compact={pending === 0} />
        <FlagList title="Contradicciones" icon={<AlertTriangle className="size-4" aria-hidden />} flags={r.contradictions} tone="rose" testId="review-contradictions" compact={pending === 0} />
        <FlagList title="Aclaraciones pendientes" icon={<MessageSquarePlus className="size-4" aria-hidden />} flags={r.clarifications} tone="brand" testId="review-clarifications" compact={pending === 0} />
      </div>
    </section>
  );
}

function ObservationList({ app, notes }: { app: ApplicationDetail; notes: Note[] }) {
  const invalidate = useInvalidateAll();
  const resolve = useMutation({
    mutationFn: (noteId: string) => api(`/applications/${app.id}/notes/${noteId}/resolve`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });
  if (!notes.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {notes.map((n) => {
        const open = n.kind === 'CLARIFICATION' && !n.resolvedAt;
        return (
          <li
            key={n.id}
            className={cn('rounded-md border-l-2 px-2.5 py-1.5 text-xs', open ? 'border-brand-500 bg-brand-50 text-brand-950' : 'border-slate-300 bg-slate-50 text-slate-700')}
            data-testid="observation"
          >
            <span className="font-semibold">{n.kind === 'CLARIFICATION' ? (n.resolvedAt ? 'Aclaración resuelta' : 'Aclaración pendiente') : 'Observación del asesor'}</span>
            <span className="text-slate-600"> · {n.author.displayName} · {formatDateTime(n.createdAt)}</span>
            <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-slate-900">{n.content}</p>
            {open && (
              <button type="button" className="mt-1 font-medium text-brand-700 underline underline-offset-2 hover:no-underline" onClick={() => resolve.mutate(n.id)} disabled={resolve.isPending}>
                Marcar como resuelta
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AddObservation({ app, item, onDone }: { app: ApplicationDetail; item: DossierItem; onDone: () => void }) {
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<NoteKind>('OBSERVATION');
  const invalidate = useInvalidateAll();
  const m = useMutation({
    mutationFn: () => api(`/applications/${app.id}/notes`, { method: 'POST', body: { content, kind, questionKey: item.stepId } }),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });
  return (
    <form
      className="mt-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (content.trim()) m.mutate();
      }}
    >
      <Textarea autoFocus aria-label={`Observación sobre ${item.label}`} value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} rows={2}
        className="min-h-16" placeholder="Qué hay que revisar o aclarar. La declaración original no se modifica." />
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Tipo de observación" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)} className="h-8 w-auto text-[13px]">
          <option value="OBSERVATION">Observación</option>
          <option value="CLARIFICATION">Aclaración pendiente</option>
        </Select>
        <Button size="sm" type="submit" loading={m.isPending} disabled={!content.trim()}>Guardar</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancelar</Button>
        <InlineError message={m.isError ? errorMessage(m.error) : null} />
      </div>
    </form>
  );
}

function ItemRow({ app, item }: { app: ApplicationDetail; item: DossierItem }) {
  const [adding, setAdding] = useState(false);
  const badge = STATUS_BADGE[item.status];
  return (
    <div id={anchor(item.stepId)} className="group scroll-mt-24 py-2.5" data-testid={`dossier-${item.stepId}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:gap-x-4">
        <dt className="col-start-1 row-start-1 text-[13px] text-slate-600 sm:pt-px" title={item.question}>{item.label}</dt>
        <dd className="col-start-1 row-start-2 min-w-0 text-sm text-slate-900 sm:col-start-2 sm:row-start-1">
          <span className="whitespace-pre-wrap font-medium">{item.answer}</span>
          {(badge || item.confirmed || item.corrections.length > 0) && (
            <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
              {badge && <Badge className={badge.className}>{badge.label}</Badge>}
              {item.confirmed && (
                <Badge className="bg-petrol-50 text-petrol-800 ring-petrol-200" title={item.confirmed.message}>
                  <CheckCircle2 className="mr-1 size-3" aria-hidden /> Confirmado
                </Badge>
              )}
              {item.corrections.length > 0 && (
                <Badge className="bg-slate-100 text-slate-700 ring-slate-300"><History className="mr-1 size-3" aria-hidden /> Corregido</Badge>
              )}
            </span>
          )}
          {item.original && <span className="mt-0.5 block text-xs text-slate-600">Escribió: «{item.original}»</span>}
          {item.corrections.map((c, i) => (
            <span key={i} className="mt-0.5 block text-xs text-slate-600">
              <span className="font-medium text-slate-700">Antes:</span> {c.previous}
              {c.previousOriginal && c.previousOriginal !== c.previous ? ` («${c.previousOriginal}»)` : ''} · corregido por el interesado {formatDateTime(c.at)}
            </span>
          ))}
          <ObservationList app={app} notes={item.observations} />
          {adding && <AddObservation app={app} item={item} onDone={() => setAdding(false)} />}
        </dd>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="Agregar observación"
            aria-label={`Agregar observación: ${item.label}`}
            className="col-start-2 row-span-2 row-start-1 inline-flex size-8 items-center justify-center self-start rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-800 group-hover:text-slate-700 sm:col-start-3 sm:row-span-1 print:hidden"
          >
            <MessageSquarePlus className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function SectionBlock({ app, section }: { app: ApplicationDetail; section: DossierSection }) {
  return (
    <div className="mt-3 first:mt-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-petrol-800">{section.title}</h4>
      <dl className="divide-y divide-slate-100">
        {section.items.map((it) => <ItemRow key={it.stepId} app={app} item={it} />)}
      </dl>
    </div>
  );
}

function MemberCard({ app, member }: { app: ApplicationDetail; member: DossierMember }) {
  return (
    <Card className="scroll-mt-24 px-4 pb-2 pt-4" data-testid={`member-${member.id}`} id={memberId(member.id)}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-600"><UserRound className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">{member.name}</h3>
          <p className="text-xs text-slate-600">
            {member.relation ?? 'Integrante'}
            {member.dni && ` · DNI ${formatDni(member.dni)}`}
            {member.birthDate && ` · Nac. ${member.birthDate}`}
            {member.age !== null && ` · ${member.age} años`}
          </p>
        </div>
        <Badge className="bg-white text-slate-600 ring-slate-200">Declaración propia</Badge>
      </div>
      {member.data.length > 0 && (
        <dl className="divide-y divide-slate-100">
          {member.data.map((it) => <ItemRow key={it.stepId} app={app} item={it} />)}
        </dl>
      )}
      {member.health.map((s) => <SectionBlock key={s.title} app={app} section={s} />)}
    </Card>
  );
}

/** Índice de la ficha: saltos directos a cada sección y a cada persona. */
function DossierIndex({ dossier }: { dossier: Dossier }) {
  const links = [
    ...dossier.general.map((s, i) => ({ href: `#${sectionId(i)}`, label: s.title })),
    ...dossier.members.map((m) => ({ href: `#${memberId(m.id)}`, label: `Salud · ${m.name.split(' ')[0]}` })),
  ];
  if (links.length < 3) return null;
  return (
    <nav aria-label="Secciones de la ficha" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {links.map((l) => (
        <a key={l.href} href={l.href} className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-brand-800">
          {l.label}
        </a>
      ))}
    </nav>
  );
}

/** Ficha profesional de preentrevista: secciones, integrantes por separado y revisión. */
export function DossierView({ app, dossier }: { app: ApplicationDetail; dossier: Dossier }) {
  return (
    <div className="flex flex-col gap-3" data-testid="dossier">
      <ReviewSummary dossier={dossier} />
      <DossierIndex dossier={dossier} />
      {dossier.general.map((s, i) => (
        <Card key={s.title} id={sectionId(i)} className="scroll-mt-24 px-4 pb-1.5 pt-4">
          <h2 className="text-[15px] font-semibold text-slate-900">{s.title}</h2>
          <dl className="mt-1 divide-y divide-slate-100">
            {s.items.map((it) => <ItemRow key={it.stepId} app={app} item={it} />)}
          </dl>
        </Card>
      ))}
      {dossier.members.length > 0 && (
        <section className="mt-2 flex flex-col gap-3" aria-labelledby="salud-por-persona">
          <h2 id="salud-por-persona" className="flex items-baseline gap-2 text-[15px] font-semibold text-slate-900">
            Declaraciones de salud por persona
            <span className="text-sm font-normal text-slate-600">({dossier.members.length})</span>
          </h2>
          {dossier.members.map((m) => <MemberCard key={m.id} app={app} member={m} />)}
        </section>
      )}
    </div>
  );
}

export function PdfButton({ app }: { app: ApplicationDetail }) {
  return (
    <a
      href={`/api/applications/${app.id}/pdf`}
      target="_blank"
      rel="noopener"
      className={buttonVariants({ variant: 'outline' })}
      data-testid="pdf-link"
    >
      <FileText aria-hidden /> Descargar PDF
    </a>
  );
}
