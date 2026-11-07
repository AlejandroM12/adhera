'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button, Field, InlineError, Input } from '@/components/ui';
import { Logo } from '@/components/logo';

// Las credenciales demo sólo se muestran en desarrollo o si se habilita explícitamente.
const SHOW_DEMO = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === 'true';

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(SHOW_DEMO ? 'asesor@adhera.demo' : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      const next = params.get('next');
      // Sólo rutas internas para evitar redirecciones abiertas.
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8" />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Ingresá al panel</h1>
        <p className="mt-1 text-sm text-slate-600">Gestión de solicitudes y entrevistas para asesores.</p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate={false}>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="username" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Contraseña" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="h-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              required
            />
          </Field>
          <InlineError message={error} />
          <Button type="submit" loading={busy} className="h-10 w-full">
            Ingresar
          </Button>
        </form>
        {SHOW_DEMO && (
          <p className="mt-5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Demo local: <strong className="font-semibold text-slate-800">asesor@adhera.demo</strong> /{' '}
            <strong className="font-semibold text-slate-800">adhera-demo</strong> (credenciales ficticias).
          </p>
        )}
        <Link href="/simulador" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
          Ver el cuestionario como interesado <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </main>
  );
}
