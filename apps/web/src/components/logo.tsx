import { cn } from '@/lib/utils';

/** Isotipo de Adhera: dos trazos que convergen en un punto (unión). */
export function Logo({ className, withText = true, light = false }: { className?: string; withText?: boolean; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill={light ? '#ffffff' : '#162744'} />
        <path d="M9 22 L16 9 L23 22" fill="none" stroke={light ? '#162744' : '#ffffff'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="19" r="2.4" fill="#489e90" />
      </svg>
      {withText && (
        <span className={cn('text-lg font-semibold tracking-tight', light ? 'text-white' : 'text-brand-900')}>Adhera</span>
      )}
    </span>
  );
}
