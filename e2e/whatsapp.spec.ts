import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E } from '../scripts/e2e-prepare.mjs';
import { loginAPI, loginUI } from './helpers';

// Los webhooks van directo a la API (como hace Meta); los envíos los registra el Graph falso.
const API = `http://localhost:${E2E.apiPort}`;
const GRAPH = `http://localhost:${E2E.graphPort}`;
const PHONE_ID = E2E.whatsapp.WHATSAPP_PHONE_NUMBER_ID;
const SECRET = E2E.whatsapp.WHATSAPP_APP_SECRET;

let seq = 0;
const wamid = () => `wamid.e2e.${Date.now()}.${++seq}`;
/** Número ficticio único por prueba. */
const fakeNumber = () => `54900${String(Date.now()).slice(-6)}${String(++seq).padStart(2, '0')}`;

type Msg = Record<string, unknown>;
const text = (from: string, body: string, id = wamid()): Msg => ({ id, from, timestamp: `${Math.floor(Date.now() / 1000)}`, type: 'text', text: { body } });
const reply = (from: string, replyId: string, id = wamid()): Msg => ({
  id, from, timestamp: `${Math.floor(Date.now() / 1000)}`, type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: replyId, title: replyId } },
});
const envelope = (value: Record<string, unknown>, phoneNumberId = PHONE_ID) =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA-TEST', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550000000', phone_number_id: phoneNumberId }, ...value } }] }],
  });

async function post(request: APIRequestContext, body: string, signature: string | null = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`) {
  return request.post(`${API}/webhooks/whatsapp`, {
    data: body,
    headers: { 'content-type': 'application/json', ...(signature ? { 'x-hub-signature-256': signature } : {}) },
  });
}
const send = async (request: APIRequestContext, m: Msg, phoneNumberId?: string) => {
  const r = await post(request, envelope({ contacts: [{ wa_id: m.from, profile: { name: 'Ficticio' } }], messages: [m] }, phoneNumberId));
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
};

type Sent = { id: string; to: string; type: string; text?: string; interactive: string | null; ids: string[]; footer: string | null };
async function sentTo(request: APIRequestContext, to: string): Promise<Sent[]> {
  return (await (await request.get(`${GRAPH}/_sent?to=${to}`)).json()).messages;
}
const last = async (request: APIRequestContext, to: string) => (await sentTo(request, to)).at(-1)!;

async function consent(request: APIRequestContext, from: string) {
  await send(request, text(from, 'Hola'));
  await send(request, reply(from, 'consent_yes'));
}

async function findApp(request: APIRequestContext, name: string) {
  await loginAPI(request);
  const list = await (await request.get(`/api/applications?view=all&search=${encodeURIComponent(name)}`)).json();
  return list.items[0] as { id: string; status: string; channel: string; handoffRequestedAt: string | null } | undefined;
}

test.describe('webhook: verificación y firma', () => {
  test('GET verifica el token de suscripción', async ({ request }) => {
    const ok = await request.get(`${API}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${E2E.whatsapp.WHATSAPP_VERIFY_TOKEN}&hub.challenge=12345`);
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toBe('12345');
    const bad = await request.get(`${API}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1`);
    expect(bad.status()).toBe(403);
  });

  test('POST rechaza firmas inválidas o ausentes sin procesar nada', async ({ request }) => {
    const from = fakeNumber();
    const body = envelope({ messages: [text(from, 'Hola')] });
    expect((await post(request, body, 'sha256=deadbeef')).status()).toBe(401);
    expect((await post(request, body, null)).status()).toBe(401);
    expect((await post(request, body, `sha256=${createHmac('sha256', 'otro-secreto').update(body).digest('hex')}`)).status()).toBe(401);
    expect(await sentTo(request, from)).toHaveLength(0);
  });

  test('ignora eventos de otros números receptores', async ({ request }) => {
    const from = fakeNumber();
    const r = await send(request, text(from, 'Hola'), '999999999');
    expect(r.ignored).toBe(1);
    expect(await sentTo(request, from)).toHaveLength(0);
  });
});

test.describe('conversación por WhatsApp', () => {
  test('cuestionario completo → solicitud visible en el panel con respuestas en orden', async ({ request, page }) => {
    const from = fakeNumber();
    const name = `Lucía WhatsApp ${seq}`;

    await send(request, text(from, 'Hola'));
    let m = await last(request, from);
    expect(m.interactive).toBe('button');
    expect(m.ids).toEqual(['consent_yes', 'consent_no']);
    expect(m.text).toContain('datos ficticios');

    await send(request, reply(from, 'consent_yes'));
    m = await last(request, from);
    expect(m.text).toContain('¿Cómo te llamás?');

    await send(request, text(from, name));
    m = await last(request, from);
    expect(m.ids).toEqual(['individual', 'family', 'corporate']);
    expect(m.footer).toMatch(/^Pregunta 2 de \d+$/);

    await send(request, reply(from, 'family'));
    expect((await last(request, from)).text).toContain('¿Cuántas personas');

    // Respuesta inválida: el motor la rechaza y se repite la pregunta.
    await send(request, text(from, 'muchas'));
    const afterInvalid = (await sentTo(request, from)).slice(-2);
    expect(afterInvalid[0]!.text).toContain('Ingresá un número válido');
    expect(afterInvalid[1]!.text).toContain('¿Cuántas personas');

    await send(request, text(from, '3'));
    await send(request, text(from, 'Rosario'));
    m = await last(request, from);
    expect(m.ids).toEqual(['messaging', 'phone', 'email']);
    await send(request, text(from, '3')); // número de opción → Correo electrónico
    await send(request, reply(from, 'afternoon'));
    m = await last(request, from);
    expect(m.ids).toEqual(['yes', 'no']);
    await send(request, reply(from, 'no'));
    m = await last(request, from);
    expect(m.text).toContain('Recibimos tu solicitud');
    expect(m.text).toContain('no toma decisiones sobre afiliación');

    // Visible para el asesor sin reiniciar servicios
    const app = await findApp(request, name);
    expect(app).toMatchObject({ status: 'PENDING_REVIEW', channel: 'WHATSAPP' });
    const detail = await (await request.get(`/api/applications/${app!.id}`)).json();
    expect(detail.answers.map((a: { display: string }) => a.display)).toEqual([name, 'Familiar', '3', 'Rosario', 'Correo electrónico', 'Tarde (12 a 18 h)', 'No']);
    expect(detail.contact.phone).toBe(from);
    expect(detail.contact.lastDelivery.status).toBe('SENT');

    // Evento de estado de Meta: el último envío pasa a "entregado"
    await post(request, envelope({ statuses: [{ id: m.id, status: 'delivered', recipient_id: from, timestamp: '1' }] }));
    const delivered = await (await request.get(`/api/applications/${app!.id}`)).json();
    expect(delivered.contact.lastDelivery.status).toBe('DELIVERED');

    // Escribir después de terminar no crea otra solicitud
    await send(request, text(from, 'hola de nuevo'));
    expect((await last(request, from)).text).toContain('Ya recibimos tu solicitud');

    await loginUI(page, '/solicitudes');
    const row = page.getByTestId('applications-table').getByRole('row').filter({ hasText: name });
    await expect(row).toContainText('WhatsApp');
    await row.getByRole('link', { name }).click();
    await expect(page.getByTestId('contact-phone')).toContainText('•');
    await page.getByRole('button', { name: 'Mostrar número' }).click();
    await expect(page.getByTestId('contact-phone')).toHaveText(`+${from}`);
    // El último envío es la respuesta a "hola de nuevo" (posterior al evento "entregado").
    await expect(page.getByTestId('last-delivery')).toHaveText('Enviado');
  });

  test('mensajes duplicados (reintentos de Meta) no duplican respuestas ni envíos', async ({ request }) => {
    const from = fakeNumber();
    const name = `Duplicado ${seq}`;
    await consent(request, from);
    const msg = text(from, name);
    const first = await send(request, msg);
    const before = (await sentTo(request, from)).length;
    const second = await send(request, msg);
    expect(first.processed).toBe(1);
    expect(second.duplicates).toBe(1);
    expect((await sentTo(request, from)).length).toBe(before);
    const app = await findApp(request, name);
    const detail = await (await request.get(`/api/applications/${app!.id}`)).json();
    expect(detail.answers).toHaveLength(1);
  });

  test('cada remitente tiene su propia conversación (aislamiento)', async ({ request }) => {
    const a = fakeNumber();
    const b = fakeNumber();
    const nameA = `Ana Aislada ${seq}`;
    const nameB = `Beto Aislado ${seq}`;
    await consent(request, a);
    await consent(request, b);
    await send(request, text(a, nameA));
    await send(request, text(b, nameB));
    await send(request, reply(a, 'individual'));
    await send(request, reply(b, 'corporate'));
    // B responde integrantes; A ya está en "ciudad"
    expect((await last(request, a)).text).toContain('ciudad');
    expect((await last(request, b)).text).toContain('¿Cuántas personas');

    const appA = await findApp(request, nameA);
    const appB = await findApp(request, nameB);
    expect(appA!.id).not.toBe(appB!.id);
    const dA = await (await request.get(`/api/applications/${appA!.id}`)).json();
    const dB = await (await request.get(`/api/applications/${appB!.id}`)).json();
    expect(dA.answers.map((x: { display: string }) => x.display)).toEqual([nameA, 'Individual']);
    expect(dB.answers.map((x: { display: string }) => x.display)).toEqual([nameB, 'Empresa']);
    expect(dA.contact.phone).toBe(a);
    expect(dB.contact.phone).toBe(b);
  });

  test('reintenta envíos fallidos y permite retomar si el envío no llegó', async ({ request }) => {
    const from = fakeNumber();
    const name = `Reintento ${seq}`;
    await consent(request, from);

    // 2 fallas transitorias: el cliente reintenta y el mensaje sale.
    await request.post(`${GRAPH}/_control`, { data: { fail: 2, status: 500 } });
    await send(request, text(from, name));
    expect((await last(request, from)).ids).toEqual(['individual', 'family', 'corporate']);

    // Falla persistente: queda registrada como no entregada.
    await request.post(`${GRAPH}/_control`, { data: { fail: 10, status: 503 } });
    const before = (await sentTo(request, from)).length;
    await send(request, reply(from, 'individual'));
    expect((await sentTo(request, from)).length).toBe(before);
    await request.post(`${GRAPH}/_control`, { data: { fail: 0 } });
    const app = await findApp(request, name);
    let detail = await (await request.get(`/api/applications/${app!.id}`)).json();
    expect(detail.contact.lastDelivery.status).toBe('FAILED');
    expect(detail.contact.lastDelivery.errorCode).toBeTruthy();
    expect(detail.answers).toHaveLength(2); // la respuesta se guardó igual

    // El interesado escribe CONTINUAR y recibe la pregunta pendiente.
    await send(request, text(from, 'continuar'));
    expect((await last(request, from)).text).toContain('ciudad');
    detail = await (await request.get(`/api/applications/${app!.id}`)).json();
    expect(detail.contact.lastDelivery.status).toBe('SENT');
  });

  test('derivación a asesor: pausa el bot, avisa en el panel y se puede continuar', async ({ request }) => {
    const from = fakeNumber();
    const name = `Derivado ${seq}`;
    await consent(request, from);
    await send(request, text(from, name));
    await send(request, text(from, 'ASESOR'));
    expect((await last(request, from)).text).toContain('avisamos a un asesor');

    const count = (await sentTo(request, from)).length;
    await send(request, text(from, '¿Cuánto cuesta el plan?'));
    expect((await sentTo(request, from)).length).toBe(count); // no inventa respuestas ni insiste

    const app = await findApp(request, name);
    expect(app!.handoffRequestedAt).toBeTruthy();
    const dash = await (await request.get('/api/dashboard/summary')).json();
    expect(dash.kpis.handoffPending).toBeGreaterThan(0);
    expect(dash.toReview.some((x: { id: string }) => x.id === app!.id)).toBe(true);
    const detail = await (await request.get(`/api/applications/${app!.id}`)).json();
    expect(detail.answers).toHaveLength(1); // la consulta no se guardó como respuesta

    await send(request, text(from, 'continuar'));
    expect((await last(request, from)).ids).toEqual(['individual', 'family', 'corporate']);
  });

  test('archivos no soportados, consentimiento rechazado y baja voluntaria', async ({ request }) => {
    // Imagen: no se guarda, se explica y se repite la pregunta.
    const a = fakeNumber();
    await consent(request, a);
    await send(request, { id: wamid(), from: a, type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg' } });
    const [info, again] = (await sentTo(request, a)).slice(-2);
    expect(info!.text).toContain('no envíes fotos');
    expect(again!.text).toContain('¿Cómo te llamás?');

    // Rechazo del aviso: no se crea solicitud.
    const b = fakeNumber();
    await send(request, text(b, 'Hola'));
    await send(request, reply(b, 'consent_no'));
    expect((await last(request, b)).text).toContain('no guardamos tus datos');

    // BAJA: confirma una vez y deja de responder; ALTA vuelve a habilitar.
    const c = fakeNumber();
    await consent(request, c);
    await send(request, text(c, 'BAJA'));
    expect((await last(request, c)).text).toContain('no te enviaremos más mensajes');
    const count = (await sentTo(request, c)).length;
    await send(request, text(c, 'Hola?'));
    expect((await sentTo(request, c)).length).toBe(count);
    await send(request, text(c, 'ALTA'));
    expect((await last(request, c)).text).toContain('¿Cómo te llamás?');
  });
});
