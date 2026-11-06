import { NextResponse, type NextRequest } from 'next/server';

/**
 * Redirige al login si no hay cookie de sesión de asesor.
 * La validación real (firma y vencimiento) la hace la API en cada request.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get('adhera_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/solicitudes/:path*', '/entrevistas/:path*', '/cuestionarios/:path*'],
};
