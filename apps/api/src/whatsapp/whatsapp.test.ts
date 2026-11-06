import { describe, expect, it, vi } from 'vitest';
import { signMetaPayload, verifyMetaSignature } from './signature';
import { extractEvents, parseCommand, questionMessage, resolveAnswer, truncate } from './payloads';
import { WhatsAppGraphClient } from './graph.client';
import { KeyedMutex, RateLimiter } from '../common/rate-limiter';
import { loadConfig } from '../config/env';

const wrap = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'PN1' }, ...value } }] }],
});

describe('firma de webhooks', () => {
  const body = Buffer.from('{"hola":"mundo"}');
  it('acepta la firma correcta y rechaza alteraciones', () => {
    const sig = signMetaPayload('secreto', body);
    expect(verifyMetaSignature('secreto', body, sig)).toBe(true);
    expect(verifyMetaSignature('otro', body, sig)).toBe(false);
    expect(verifyMetaSignature('secreto', Buffer.from('{"hola":"mundx"}'), sig)).toBe(false);
  });
  it('rechaza firmas ausentes o mal formadas', () => {
    expect(verifyMetaSignature('secreto', body, undefined)).toBe(false);
    expect(verifyMetaSignature('secreto', body, 'sha1=abc')).toBe(false);
    expect(verifyMetaSignature('secreto', undefined, 'sha256=abc')).toBe(false);
    expect(verifyMetaSignature('', body, signMetaPayload('', body))).toBe(false);
  });
});

describe('normalización de eventos', () => {
  it('lee texto, botones, listas y tipos no soportados', () => {
    const ev = extractEvents(
      wrap({
        messages: [
          { id: 'w1', from: '5491100000001', timestamp: '1700000000', type: 'text', text: { body: 'Hola' } },
          { id: 'w2', from: '5491100000001', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'yes', title: 'Sí' } } },
          { id: 'w3', from: '5491100000001', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'family', title: 'Familiar' } } },
          { id: 'w4', from: '5491100000001', type: 'image', image: { id: 'media' } },
          { from: 'sin-id', type: 'text', text: { body: 'x' } },
        ],
      }),
    );
    expect(ev.messages.map((m) => [m.id, m.kind, m.text ?? m.replyId ?? null])).toEqual([
      ['w1', 'text', 'Hola'],
      ['w2', 'reply', 'yes'],
      ['w3', 'reply', 'family'],
      ['w4', 'unsupported', null],
    ]);
    expect(ev.messages[0]!.phoneNumberId).toBe('PN1');
    expect(ev.messages[0]!.timestamp.toISOString()).toBe('2023-11-14T22:13:20.000Z');
  });

  it('trunca textos largos y lee estados con código de error', () => {
    const ev = extractEvents(
      wrap({
        messages: [{ id: 'w5', from: '1', type: 'text', text: { body: 'x'.repeat(5000) } }],
        statuses: [
          { id: 'out1', status: 'delivered', recipient_id: '1' },
          { id: 'out2', status: 'failed', recipient_id: '1', errors: [{ code: 131047, title: 'Re-engagement' }] },
          { id: 'out3', status: 'deleted' },
        ],
      }),
    );
    expect(ev.messages[0]!.text).toHaveLength(1000);
    expect(ev.statuses).toEqual([
      { id: 'out1', status: 'delivered', recipient: '1', phoneNumberId: 'PN1' },
      { id: 'out2', status: 'failed', recipient: '1', phoneNumberId: 'PN1', errorCode: '131047' },
    ]);
  });

  it('ignora payloads ajenos', () => {
    expect(extractEvents({ object: 'page', entry: [] })).toEqual({ messages: [], statuses: [] });
    expect(extractEvents(null)).toEqual({ messages: [], statuses: [] });
    expect(extractEvents({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'account_update', value: {} }] }] })).toEqual({ messages: [], statuses: [] });
  });
});

describe('comandos', () => {
  it('reconoce palabras clave sin importar mayúsculas ni acentos', () => {
    expect(parseCommand('ASESOR')).toBe('handoff');
    expect(parseCommand('  Hablar con un asesor ')).toBe('handoff');
    expect(parseCommand('baja')).toBe('stop');
    expect(parseCommand('Continuar')).toBe('continue');
    expect(parseCommand('nueva')).toBe('restart');
    expect(parseCommand('Omitir')).toBe('skip');
  });
  it('no confunde respuestas que contienen la palabra', () => {
    expect(parseCommand('Quiero un asesor que sepa de planes familiares')).toBeNull();
    expect(parseCommand('Córdoba')).toBeNull();
    expect(parseCommand(undefined)).toBeNull();
  });
});

describe('mensajes salientes', () => {
  const choice = (labels: string[]) => ({
    key: 'k', label: '¿Opción?', type: 'single_choice', required: true,
    options: labels.map((l, i) => ({ value: `v${i}`, label: l })),
  });

  it('Sí/No y hasta 3 opciones cortas usan botones', () => {
    const yn = questionMessage('1', { key: 'q', label: '¿Seguro?', type: 'yes_no', required: true }, { answered: 2, total: 7 }) as any;
    expect(yn.interactive.type).toBe('button');
    expect(yn.interactive.action.buttons.map((b: any) => b.reply.id)).toEqual(['yes', 'no']);
    expect(yn.interactive.footer.text).toBe('Pregunta 3 de 7');
    const three = questionMessage('1', choice(['Individual', 'Familiar', 'Empresa'])) as any;
    expect(three.interactive.action.buttons.map((b: any) => b.reply.id)).toEqual(['v0', 'v1', 'v2']);
  });

  it('opciones largas o más de 3 usan lista; más de 10, texto numerado', () => {
    const list = questionMessage('1', choice(['Mañana (9 a 12 h)', 'Tarde (12 a 18 h)', 'Noche, después de las 18 horas'])) as any;
    expect(list.interactive.type).toBe('list');
    const row = list.interactive.action.sections[0].rows[2];
    expect(row.title.length).toBeLessThanOrEqual(24);
    expect(row.description).toContain('Noche');
    const many = questionMessage('1', choice(Array.from({ length: 12 }, (_, i) => `Opción ${i + 1}`))) as any;
    expect(many.type).toBe('text');
    expect(many.text.body).toContain('12. Opción 12');
  });

  it('las preguntas opcionales indican cómo omitirlas', () => {
    const msg = questionMessage('1', { key: 'c', label: 'Observación', type: 'text', required: false }) as any;
    expect(msg.text.body).toContain('OMITIR');
  });

  it('trunca respetando límites', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});

describe('resolución de respuestas', () => {
  const q = { key: 'k', label: 'x', type: 'single_choice', required: true, options: [{ value: 'family', label: 'Familiar' }, { value: 'corporate', label: 'Empresa' }] };
  it('acepta id de botón, número de opción o texto', () => {
    expect(resolveAnswer(q, { replyId: 'family' })).toBe('family');
    expect(resolveAnswer(q, { text: '2' })).toBe('corporate');
    expect(resolveAnswer(q, { text: 'Familiar' })).toBe('Familiar');
    expect(resolveAnswer(q, { text: '9' })).toBe('9');
  });
  it('mapea Sí/No', () => {
    const yn = { key: 'y', label: 'x', type: 'yes_no', required: true };
    expect(resolveAnswer(yn, { replyId: 'yes' })).toBe(true);
    expect(resolveAnswer(yn, { replyId: 'no' })).toBe(false);
    expect(resolveAnswer(yn, { text: 'si' })).toBe('si');
  });
});

describe('cliente Graph API', () => {
  const make = (responses: Array<{ status: number; body?: unknown } | 'network'>) => {
    const calls: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      calls.push(init);
      const r = responses.shift() ?? { status: 200, body: { messages: [{ id: 'wamid.ok' }] } };
      if (r === 'network') throw new Error('ECONNRESET');
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    });
    const client = new WhatsAppGraphClient({
      baseUrl: 'https://graph.test', version: 'v23.0', phoneNumberId: 'PN1', accessToken: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch, backoffMs: [1, 1], sleep: async () => undefined,
    });
    return { client, fetchImpl, calls };
  };

  it('reintenta errores transitorios y devuelve el id', async () => {
    const { client, fetchImpl } = make([{ status: 500 }, 'network', { status: 200, body: { messages: [{ id: 'wamid.3' }] } }]);
    expect(await client.send({ a: 1 })).toEqual({ ok: true, messageId: 'wamid.3', attempts: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://graph.test/v23.0/PN1/messages');
  });

  it('no reintenta errores de validación', async () => {
    const { client, fetchImpl } = make([{ status: 400, body: { error: { code: 131030 } } }]);
    expect(await client.send({})).toEqual({ ok: false, errorCode: '131030', retryable: false, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('se rinde tras agotar reintentos', async () => {
    const { client } = make([{ status: 429 }, { status: 503 }, { status: 500 }]);
    expect(await client.send({})).toMatchObject({ ok: false, errorCode: 'http_500', retryable: true, attempts: 3 });
  });
});

describe('controles anti-abuso', () => {
  it('limita por clave dentro de la ventana', () => {
    let now = 0;
    const rl = new RateLimiter(2, 1000, () => now);
    expect([rl.allow('a'), rl.allow('a'), rl.allow('a'), rl.allow('b')]).toEqual([true, true, false, true]);
    now = 1500;
    expect(rl.allow('a')).toBe(true);
  });

  it('serializa tareas por contacto', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    const slow = (id: string, ms: number) => () => new Promise<void>((r) => setTimeout(() => { order.push(id); r(); }, ms));
    await Promise.all([mutex.run('c1', slow('1', 20)), mutex.run('c1', slow('2', 1)), mutex.run('c2', slow('x', 5))]);
    expect(order.indexOf('1')).toBeLessThan(order.indexOf('2'));
  });
});

describe('configuración por entorno', () => {
  const base = { DATABASE_URL: 'postgres://x', SESSION_SECRET: 'x'.repeat(40), WEB_ORIGIN: 'https://adhera.example' };
  it('producción exige HTTPS, secreto largo y credenciales de WhatsApp si se habilita', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production', SESSION_SECRET: 'corto-de-16-chars' })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ ...base, APP_ENV: 'production', WEB_ORIGIN: 'http://inseguro' })).toThrow(/WEB_ORIGIN/);
    expect(() => loadConfig({ ...base, APP_ENV: 'production', WHATSAPP_ENABLED: 'true' })).toThrow(/WHATSAPP_APP_SECRET/);
    expect(() => loadConfig({ ...base, APP_ENV: 'production', WHATSAPP_GRAPH_BASE_URL: 'http://localhost:4199' })).toThrow(/GRAPH_BASE_URL/);
    const ok = loadConfig({
      ...base, APP_ENV: 'production', WHATSAPP_ENABLED: 'true', WHATSAPP_VERIFY_TOKEN: 'v', WHATSAPP_APP_SECRET: 's',
      WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '1',
    });
    expect(ok.WHATSAPP_ENABLED).toBe(true);
    expect(ok.WHATSAPP_GRAPH_VERSION).toMatch(/^v\d+\.\d+$/);
  });
});
