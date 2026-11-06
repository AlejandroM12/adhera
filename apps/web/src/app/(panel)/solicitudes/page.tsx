import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ApplicationsList } from './applications-list';

export const metadata: Metadata = { title: 'Solicitudes' };

export default function SolicitudesPage() {
  return (
    <Suspense>
      <ApplicationsList />
    </Suspense>
  );
}
