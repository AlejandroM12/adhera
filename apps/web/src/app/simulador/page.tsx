import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Simulator } from './simulator';

export const metadata: Metadata = { title: 'Simulador' };

export default function SimuladorPage() {
  return (
    <Suspense>
      <Simulator />
    </Suspense>
  );
}
