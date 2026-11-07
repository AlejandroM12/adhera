import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';

// Public Sans desde el paquete npm (sin descargas externas al compilar ni al cargar la página).
const publicSans = localFont({
  src: '../../node_modules/@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-public-sans',
});

export const metadata: Metadata = {
  title: { default: 'Adhera', template: '%s · Adhera' },
  description: 'Demo de preafiliación conversacional y gestión comercial (datos ficticios).',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#162744', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={publicSans.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
