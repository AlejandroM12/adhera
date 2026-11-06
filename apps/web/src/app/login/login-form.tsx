'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button, Card, Field, InlineError, Input } from '@/components/ui';
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
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-petrol-900 via-petrol-800 to-petrol-700 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo light />
        </div>
        <Card className="p-6">
          <h1 className="text-xl font-semibold text-slate-900">Ingreso de asesores</h1>
          <p className="mt-1 text-sm text-slate-500">Accedé al panel de solicitudes.</p>
          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Contraseña" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <InlineError message={error} />
            <Button type="submit" loading={busy} className="w-full">
              Ingresar
            </Button>
          </form>
          {SHOW_DEMO && (
            <p className="mt-4 rounded-lg bg-petrol-50 px-3 py-2 text-xs text-petrol-800">
              Demo local: <strong>asesor@adhera.demo</strong> / <strong>adhera-demo</strong> (credenciales ficticias).
            </p>
          )}
        </Card>
        <Link href="/simulador" className="mt-4 flex items-center justify-center gap-2 text-sm text-petrol-100 hover:text-white">
          <MessageCircle className="size-4" /> Probar el simulador del interesado
        </Link>
      </div>
    </main>
  );
}
