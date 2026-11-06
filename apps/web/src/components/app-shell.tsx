'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, LayoutDashboard, LogOut, MessageCircle, Settings2 } from 'lucide-react';
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
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-petrol-900 text-petrol-100 lg:flex">
        <div className="px-5 py-5">
          <Logo light />
          <p className="mt-1 pl-10 text-[11px] uppercase tracking-wider text-petrol-300">Preafiliación demo</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive(path, href) ? 'bg-petrol-700 text-white' : 'text-petrol-200 hover:bg-petrol-800 hover:text-white',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
          <Link
            href="/simulador"
            target="_blank"
            className="mt-4 flex items-center gap-3 rounded-lg border border-petrol-700 px-3 py-2 text-sm text-turq-200 hover:bg-petrol-800"
          >
            <MessageCircle className="size-4" /> Abrir simulador
          </Link>
        </nav>
        <div className="border-t border-petrol-800 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-turq-500 text-sm font-semibold text-white">
              {me.data ? initials(me.data.user.displayName) : '·'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{me.data?.user.displayName ?? '…'}</p>
              <p className="truncate text-xs text-petrol-300">{me.data?.user.email}</p>
            </div>
            <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="rounded-md p-1.5 text-petrol-200 hover:bg-petrol-800 hover:text-white">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={logout} className="flex items-center gap-1.5 text-sm text-slate-600" aria-label="Cerrar sesión">
          <LogOut className="size-4" /> Salir
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>

      {/* Navegación inferior mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white lg:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
              isActive(path, href) ? 'text-turq-600' : 'text-slate-500',
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
