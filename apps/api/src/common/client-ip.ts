import { timingSafeEqual } from 'crypto';

/** Headers que agrega el panel (Next) al reenviar /api/* a la API. */
export const CLIENT_IP_HEADER = 'x-adhera-client-ip';
export const PROXY_KEY_HEADER = 'x-adhera-proxy-key';

type RequestLike = { ip?: string; headers: Record<string, string | string[] | undefined> };

function header(req: RequestLike, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * IP del interesado para los límites anti-abuso.
 * El navegador llega a la API a través del proxy del panel, así que `req.ip` sería la IP del panel
 * (un único límite compartido por todos). El panel envía la IP original en `x-adhera-client-ip`,
 * y sólo se confía en ese header si viene con la clave compartida `PROXY_SECRET`.
 * Sin clave válida se usa `req.ip` (nunca se acepta una IP declarada por el cliente).
 */
export function clientIp(req: RequestLike, proxySecret: string | undefined): string {
  const forwarded = header(req, CLIENT_IP_HEADER)?.trim();
  const key = header(req, PROXY_KEY_HEADER);
  if (proxySecret && forwarded && key && sameSecret(key, proxySecret) && forwarded.length <= 64) {
    return forwarded;
  }
  return req.ip ?? 'unknown';
}
