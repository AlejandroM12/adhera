import Link from 'next/link';
import { Logo } from '@/components/logo';
import { buttonVariants } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold text-slate-900">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-slate-500">La dirección no existe o fue movida.</p>
      <div className="flex gap-2">
        <Link href="/" className={buttonVariants()}>Ir al panel</Link>
        <Link href="/simulador" className={buttonVariants({ variant: 'outline' })}>Abrir simulador</Link>
      </div>
    </main>
  );
}
