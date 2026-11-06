import { expect, test } from '@playwright/test';
import { loginAPI, loginUI } from './helpers';

type Q = { key: string; label: string; type: string; required: boolean; options?: unknown; condition?: unknown; validation?: unknown };

test('publicar una nueva versión no altera sesiones existentes', async ({ page, request }) => {
  // Sesión iniciada con la versión activa actual
  const old = await (await request.post('/api/sessions', { data: { acceptedNotice: true } })).json();
  const oldState = await (await request.get(`/api/sessions/${old.sessionId}`, { headers: { 'x-session-token': old.resumeToken } })).json();
  const oldVersion = oldState.questionnaire.version as number;
  const oldLabel = oldState.nextQuestion.label as string;

  // Editar el borrador desde la UI (aceptando la confirmación de publicación)
  page.on('dialog', (d) => d.accept());
  await loginUI(page, '/cuestionarios');
  await expect(page.getByRole('button', { name: /Versión 1/ })).toBeVisible();
  const createDraft = page.getByRole('button', { name: /Nuevo borrador desde/ });
  if (await createDraft.isVisible()) await createDraft.click();
  const firstLabel = page.getByLabel('Texto pregunta 1');
  const newLabel = `¿Cuál es tu nombre ficticio? (v${Date.now() % 10000})`;
  await firstLabel.fill(newLabel);
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado.')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar versión' }).click();
  await expect(page.getByText('Publicada').first()).toBeVisible();

  // Sesiones nuevas usan la versión nueva
  const fresh = await (await request.post('/api/sessions', { data: { acceptedNotice: true } })).json();
  expect(fresh.questionnaire.version).toBeGreaterThan(oldVersion);
  expect(fresh.nextQuestion.label).toBe(newLabel);

  // La sesión anterior conserva su versión y su texto original
  const again = await (await request.get(`/api/sessions/${old.sessionId}`, { headers: { 'x-session-token': old.resumeToken } })).json();
  expect(again.questionnaire.version).toBe(oldVersion);
  expect(again.nextQuestion.label).toBe(oldLabel);

  // Un borrador con condición inválida no se puede publicar
  await loginAPI(request);
  const list = await (await request.get('/api/questionnaires')).json();
  const detail = await (await request.get(`/api/questionnaires/${list[0].id}`)).json();
  const published = detail.versions.find((v: { status: string }) => v.status === 'PUBLISHED');
  const broken: Q[] = published.questions.map((q: Q) => ({ key: q.key, label: q.label, type: q.type, required: q.required, options: q.options, condition: q.condition, validation: q.validation }));
  broken[0] = { ...broken[0]!, condition: { questionKey: 'city', equals: 'x' } };
  const saved = await (await request.patch(`/api/questionnaires/${list[0].id}/draft`, { data: { questions: broken } })).json();
  expect(saved.errors.length).toBeGreaterThan(0);
  const pub = await request.post(`/api/questionnaires/${list[0].id}/publish`);
  expect(pub.status()).toBe(400);

  // Restaurar el texto original como nueva versión para dejar la demo prolija
  const restored = broken.map((q, i) => (i === 0 ? { ...q, label: oldLabel, condition: null } : q));
  await request.patch(`/api/questionnaires/${list[0].id}/draft`, { data: { questions: restored } });
  expect((await request.post(`/api/questionnaires/${list[0].id}/publish`)).ok()).toBeTruthy();
});
