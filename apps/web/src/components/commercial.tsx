/**
 * Piezas visuales compartidas por el panel comercial (dashboard, listado y ficha).
 */
import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { Card, Skeleton } from '@/components/ui';

const AVATAR_TONES = [
  'bg-petrol-100 text-petrol-800',
  'bg-turq-100 text-turq-700',
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
];

/** Avatar con iniciales y un tono estable derivado del nombre. */
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' };
  return (
    <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', tone, sizes[size], className)}>
      {initials(name) || '?'}
    </span>
  );
}

export function StatCard({
  label, value, hint, icon: Icon, href, tone = 'default', testId, loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: 'default' | 'attention';
  testId?: string;
  loading?: boolean;
}) {
  const body = (
    <Card className={cn('h-full p-4 transition-shadow', href && 'group-hover:shadow-md', tone === 'attention' && 'border-amber-200')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', tone === 'attention' ? 'bg-amber-50 text-amber-700' : 'bg-turq-50 text-turq-700')}>
          <Icon className="size-4" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-16" />
      ) : (
        <p className="mt-1 text-3xl font-semibold tabular-nums text-petrol-900" data-testid={testId}>
          {value}
        </p>
      )}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turq-400 rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Tarjeta con encabezado (título + acción opcional) usada en todo el panel. */
export function SectionCard({
  title, description, action, children, className, bodyClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn('flex-1 px-5 pb-5', bodyClassName)}>{children}</div>
    </Card>
  );
}

/** Grilla de datos etiqueta → valor; los valores largos ocupan el ancho completo. */
export function KeyValueGrid({ items, testId }: { items: { key: string; label: string; value: React.ReactNode; long?: boolean }[]; testId?: string }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2" data-testid={testId}>
      {items.map((it) => (
        <div key={it.key} className={cn('min-w-0', it.long && 'sm:col-span-2')} data-testid={`profile-${it.key}`}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{it.label}</dt>
          <dd className={cn('mt-0.5 text-sm text-slate-900', it.long ? 'whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2' : 'font-medium')}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Chips con los datos clave de una solicitud (cobertura, integrantes, ciudad…). */
export function Highlights({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {items.map((h) => (
        <span key={h} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
          {h}
        </span>
      ))}
    </span>
  );
}

/** Canal de origen (texto neutro, sin logos de terceros). */
export function ChannelTag({ channel }: { channel: 'SIMULATOR' | 'WHATSAPP' }) {
  if (channel !== 'WHATSAPP') return null;
  return (
    <span className="inline-flex items-center rounded-md bg-turq-50 px-1.5 py-0.5 text-[11px] font-medium text-turq-700 ring-1 ring-inset ring-turq-200">
      WhatsApp
    </span>
  );
}

/** El interesado pidió hablar con una persona. */
export function HandoffTag({ at }: { at: string | null | undefined }) {
  if (!at) return null;
  return (
    <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300">
      Pidió asesor
    </span>
  );
}
