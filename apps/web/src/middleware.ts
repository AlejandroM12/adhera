import { NextResponse, type NextRequest } from 'next/server';

const PANEL_PREFIXES = ['/solicitudes', '/entrevistas', '/cuestionarios'];

/**
 * IP del visitante tal como la ve el panel.
 * En Render todo el tráfico entra por Cloudflare, que **reemplaza** `cf-connecting-ip` con la IP que se conectó
 * (un visitante no puede imponer ese valor). No se usan `true-client-ip`, `x-real-ip` ni el primer valor de
 * `x-forwarded-for`, porque pueden llegar tal como los mandó el visitante.
 * Respaldo: el último valor de `x-forwarded-for`, que agrega el proxy más cercano (no el visitante).
 */
function visitorIp(req: NextRequest): string {
  const h = req.headers;
  const cf = h.get('cf-connecting-ip')?.trim();
  const lastHop = h.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return (cf || lastHop || 'unknown').slice(0, 64);
}

/**
 * - /api/*: el panel reenvía a la API. Agrega la IP del visitante y la clave compartida (PROXY_SECRET)
 *   para que los límites anti-abuso se apliquen por visitante y no al panel en conjunto.
 *   Cualquier valor de esos headers enviado por el navegador se descarta.
 * - Rutas del panel: redirige al login si no hay cookie de sesión de asesor.
 *   La validación real (firma y vencimiento) la hace la API en cada request.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    const headers = new Headers(req.headers);
    headers.delete('x-adhera-client-ip');
    headers.delete('x-adhera-proxy-key');
    const secret = process.env.PROXY_SECRET;
    if (secret) {
      headers.set('x-adhera-client-ip', visitorIp(req));
      headers.set('x-adhera-proxy-key', secret);
    }
    return NextResponse.next({ request: { headers } });
  }

  const isPanel = pathname === '/' || PANEL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPanel && !req.cookies.get('adhera_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/solicitudes/:path*', '/entrevistas/:path*', '/cuestionarios/:path*', '/api/:path*'],
};
