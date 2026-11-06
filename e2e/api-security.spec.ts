import { expect, test } from '@playwright/test';
import { loginAPI } from './helpers';

const start = async (request: import('@playwright/test').APIRequestContext) => {
  const r = await request.post('/api/sessions', { data: { acceptedNotice: true } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as { sessionId: string; resumeToken: string };
};

test.describe('seguridad de API', () => {
  test('el token de una sesión no da acceso a otra', async ({ request }) => {
    const a = await start(request);
    const b = await start(request);
    const cross = await request.get(`/api/sessions/${a.sessionId}`, { headers: { 'x-session-token': b.resumeToken } });
    expect(cross.status()).toBe(403);
    const crossAnswer = await request.post(`/api/sessions/${a.sessionId}/answers`, {
      headers: { 'x-session-token': b.resumeToken },
      data: { questionKey: 'full_name', value: 'Intruso', requestId: 'req-cross-0001' },
    });
    expect(crossAnswer.status()).toBe(403);
    const noToken = await request.get(`/api/sessions/${a.sessionId}`);
    expect(noToken.status()).toBe(403);
    const own = await request.get(`/api/sessions/${a.sessionId}`, { headers: { 'x-session-token': a.resumeToken } });
    expect(own.ok()).toBeTruthy();
  });

  test('el token de sesión no sirve para endpoints de asesor', async ({ request }) => {
    const a = await start(request);
    const r = await request.get('/api/applications', { headers: { 'x-session-token': a.resumeToken } });
    expect(r.status()).toBe(401);
  });

  test('endpoints privados y mutaciones exigen sesión de asesor', async ({ request }) => {
    for (const [method, path] of [
      ['get', '/api/applications'],
      ['get', '/api/applications/seed-app-01'],
      ['patch', '/api/applications/seed-app-01'],
      ['post', '/api/applications/seed-app-01/notes'],
      ['get', '/api/applications/seed-app-01/activity'],
      ['get', '/api/interviews'],
      ['post', '/api/interviews'],
      ['get', '/api/questionnaires'],
      ['post', '/api/questionnaires/seed-questionnaire/publish'],
      ['get', '/api/dashboard/summary'],
      ['get', '/api/users'],
    ] as const) {
      const r = await request[method](path, { data: method === 'get' ? undefined : {} });
      expect(r.status(), `${method.toUpperCase()} ${path}`).toBe(401);
    }
  });

  test('respuestas idempotentes por requestId y validación de entrada', async ({ request }) => {
    const s = await start(request);
    const headers = { 'x-session-token': s.resumeToken };
    const body = { questionKey: 'full_name', value: 'Idempotente Demo', requestId: `req-${Date.now()}-x` };
    const r1 = await request.post(`/api/sessions/${s.sessionId}/answers`, { headers, data: body });
    const r2 = await request.post(`/api/sessions/${s.sessionId}/answers`, { headers, data: body });
    expect(r1.ok() && r2.ok()).toBeTruthy();
    expect((await r2.json()).progress.answered).toBe(1);

    const bad = await request.post(`/api/sessions/${s.sessionId}/answers`, {
      headers,
      data: { questionKey: 'coverage_type', value: 'inexistente', requestId: `req-${Date.now()}-y` },
    });
    expect(bad.status()).toBe(422);
    const early = await request.post(`/api/sessions/${s.sessionId}/complete`, { headers });
    expect(early.status()).toBe(400);
  });

  test('login con credenciales inválidas falla', async ({ request }) => {
    const r = await request.post('/api/auth/login', { data: { email: 'asesor@adhera.demo', password: 'incorrecta' } });
    expect(r.status()).toBe(401);
    await loginAPI(request);
    expect((await request.get('/api/auth/me')).ok()).toBeTruthy();
  });
});

test.describe('reglas de negocio de asesor', () => {
  test('no se programa una entrevista en el pasado ni se vuelve a "En curso"', async ({ request }) => {
    await loginAPI(request);
    const past = await request.post('/api/interviews', {
      data: { applicationId: 'seed-app-02', scheduledAt: new Date(Date.now() - 86_400_000).toISOString() },
    });
    expect(past.status()).toBe(400);
    expect((await past.json()).message).toContain('fecha y hora futura');

    const back = await request.patch('/api/applications/seed-app-02', { data: { status: 'IN_PROGRESS' } });
    expect(back.status()).toBe(400);
    expect((await back.json()).message).toContain('no puede volver');
  });

  test('errores de validación en español', async ({ request }) => {
    await loginAPI(request);
    const r = await request.post('/api/applications/seed-app-02/notes', { data: { content: '' } });
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toBe('La nota no puede estar vacía.');
    const missing = await request.post('/api/interviews', { data: {} });
    expect((await missing.json()).message).toBe('Campo obligatorio.');
  });
});
