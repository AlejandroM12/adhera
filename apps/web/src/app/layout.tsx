import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Adhera', template: '%s · Adhera' },
  description: 'Demo de preafiliación conversacional y gestión comercial (datos ficticios).',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#1a4e5e', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
