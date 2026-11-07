'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, ExternalLink, LayoutDashboard, LogOut, MessageCircle, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Advisor } from '@/lib/types';
import { cn, initials } from '@/lib/utils';
import { Logo } from './logo';

const NAV = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/solicitudes', label: 'Solicitudes', icon: ClipboardList },
  { href: '/entrevistas', label: 'Entrevistas', icon: CalendarDays },
  { href: '/cuestionarios', label: 'Cuestionarios', icon: Settings2 },
];

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: Advisor }>('/auth/me'), staleTime: 60_000 });

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  }

  return (
    <div className="min-h-dvh lg:pl-60">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Saltar al contenido
      </a>

      {/* Barra lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-brand-900 text-brand-100 lg:flex">
        <div className="px-5 pb-6 pt-5">
          <Logo light />
          <p className="mt-1.5 pl-10 text-[11px] font-medium uppercase tracking-wider text-brand-300">Panel de asesores</p>
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = isActive(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  on ? 'bg-white/10 text-white' : 'text-brand-200 hover:bg-white/5 hover:text-white',
                )}
              >
                {on && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-petrol-300" aria-hidden />}
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
          <div className="mt-6 border-t border-white/10 pt-4">
            <Link
              href="/simulador"
              target="_blank"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-brand-200 hover:bg-white/5 hover:text-white"
            >
              <MessageCircle className="size-4" aria-hidden /> Abrir simulador
              <ExternalLink className="ml-auto size-3.5 opacity-60" aria-label="(se abre en otra pestaña)" />
            </Link>
          </div>
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white" aria-hidden>
              {me.data ? initials(me.data.user.displayName) : '·'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{me.data?.user.displayName ?? '…'}</p>
              <p className="truncate text-xs text-brand-300">{me.data?.user.email}</p>
            </div>
            <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="rounded-md p-1.5 text-brand-200 hover:bg-white/10 hover:text-white">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      {/* Encabezado (mobile) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden">
        <Logo />
        <button onClick={logout} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100" aria-label="Cerrar sesión">
          <LogOut className="size-4" aria-hidden /> Salir
        </button>
      </header>

      <main id="contenido" className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>

      {/* Navegación inferior (mobile) */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', on ? 'text-brand-800' : 'text-slate-500')}
            >
              <Icon className={cn('size-5', on && 'text-petrol-600')} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
