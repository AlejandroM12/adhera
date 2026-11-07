import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Simulator } from '../simulador/simulator';

export const metadata: Metadata = {
  title: 'Demo',
  description: 'Simulador de preafiliación conversacional de Adhera. Demostración con datos ficticios.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#162744' };

/** Demostración comercial pública: mismo simulador y mismos endpoints, sin enlace al panel. */
export default function DemoPage() {
  return (
    <Suspense>
      <Simulator basePath="/demo" showPanelLink={false} />
    </Suspense>
  );
}
