import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';
import { loadConfig } from '../config/env';
import { RateLimiter } from './rate-limiter';

const SECRET = 'x'.repeat(40);
const req = (headers: Record<string, string>, ip = '10.0.0.5') => ({ ip, headers });

describe('clientIp', () => {
  it('usa la IP reenviada por el panel cuando la clave coincide', () => {
    expect(clientIp(req({ 'x-adhera-client-ip': '203.0.113.7', 'x-adhera-proxy-key': SECRET }), SECRET)).toBe('203.0.113.7');
  });

  it('ignora la IP declarada si la clave falta o no coincide (no se puede falsificar)', () => {
    expect(clientIp(req({ 'x-adhera-client-ip': '203.0.113.7' }), SECRET)).toBe('10.0.0.5');
    expect(clientIp(req({ 'x-adhera-client-ip': '203.0.113.7', 'x-adhera-proxy-key': 'otra-clave' }), SECRET)).toBe('10.0.0.5');
    expect(clientIp(req({ 'x-adhera-client-ip': '203.0.113.7', 'x-adhera-proxy-key': SECRET + 'x' }), SECRET)).toBe('10.0.0.5');
  });

  it('sin PROXY_SECRET configurada usa siempre req.ip', () => {
    expect(clientIp(req({ 'x-adhera-client-ip': '203.0.113.7', 'x-adhera-proxy-key': SECRET }), undefined)).toBe('10.0.0.5');
    expect(clientIp({ headers: {} }, undefined)).toBe('unknown');
  });

  it('descarta valores reenviados demasiado largos', () => {
    expect(clientIp(req({ 'x-adhera-client-ip': '1'.repeat(65), 'x-adhera-proxy-key': SECRET }), SECRET)).toBe('10.0.0.5');
  });
});

describe('límites del simulador', () => {
  const base = { DATABASE_URL: 'postgres://x', SESSION_SECRET: 's'.repeat(40) };

  it('PROXY_SECRET es opcional, vacía equivale a no definida y debe ser larga', () => {
    expect(loadConfig(base).PROXY_SECRET).toBeUndefined();
    expect(loadConfig({ ...base, PROXY_SECRET: '' }).PROXY_SECRET).toBeUndefined();
    expect(() => loadConfig({ ...base, PROXY_SECRET: 'corta' })).toThrow(/PROXY_SECRET/);
    expect(loadConfig({ ...base, PROXY_SECRET: SECRET }).PROXY_SECRET).toBe(SECRET);
  });

  it('tope global por defecto de 300 conversaciones nuevas por hora', () => {
    expect(loadConfig(base).SIMULATOR_STARTS_PER_HOUR_GLOBAL).toBe(300);
  });

  it('el límite por IP separa visitantes distintos', () => {
    const l = new RateLimiter(2, 60_000);
    expect([l.allow('a'), l.allow('a'), l.allow('a')]).toEqual([true, true, false]);
    expect(l.allow('b')).toBe(true);
  });
});
