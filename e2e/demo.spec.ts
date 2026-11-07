import { expect, test } from '@playwright/test';
import { answerChoice, answerText, expectQuestion, loginAPI } from './helpers';

test('demo pública: sin login, identificada como simulador, guarda la solicitud y permite reiniciar', async ({ page, request }) => {
  const name = `Demo Ficticia ${Date.now()}`;

  // Pública: no redirige al login y no ofrece el enlace al panel.
  await page.goto('/demo');
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByTestId('simulator-badge')).toHaveText(/Simulador/i);
  await expect(page.getByTestId('demo-notice')).toContainText('Usá sólo datos ficticios');
  await expect(page.getByRole('link', { name: /Panel de asesores/ })).toHaveCount(0);

  // Sin aceptar el aviso no se puede empezar.
  await expect(page.getByRole('button', { name: 'Comenzar conversación' })).toBeDisabled();
  await page.getByLabel('Entiendo y acepto usar datos ficticios en esta demo.').check();
  await page.getByRole('button', { name: 'Comenzar conversación' }).click();

  // Mismo motor que el simulador: validación del servidor incluida.
  await expectQuestion(page, '¿Cómo te llamás?');
  await answerText(page, name);
  await answerChoice(page, 'Familiar');
  await answerText(page, '1');
  await expect(page.getByTestId('chat').getByRole('alert')).toContainText('El mínimo es 2');
  await answerText(page, '3');
  await answerText(page, 'Ciudad Ficticia');
  await answerChoice(page, 'Correo electrónico');
  await answerChoice(page, 'Mañana (9 a 12 h)');
  await answerChoice(page, 'No');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByTestId('completed')).toContainText('Recibimos tu solicitud');

  // Se guardó en la base y la ve el asesor (con su sesión).
  await loginAPI(request);
  const list = await request.get('/api/applications', { params: { search: name } });
  expect(list.ok()).toBeTruthy();
  const body = await list.json();
  const items = body.items ?? body;
  expect(JSON.stringify(items)).toContain(name);

  // Reiniciar: vuelve al aviso y una conversación nueva empieza de cero.
  await page.getByRole('button', { name: 'Iniciar una nueva conversación' }).click();
  await expect(page.getByRole('button', { name: 'Comenzar conversación' })).toBeVisible();
  await page.getByLabel('Entiendo y acepto usar datos ficticios en esta demo.').check();
  await page.getByRole('button', { name: 'Comenzar conversación' }).click();
  await expectQuestion(page, '¿Cómo te llamás?');
  await expect(page.getByTestId('progress')).toHaveText(/^0 de \d+/);

  // Reiniciar a mitad de conversación (con confirmación) desde el encabezado.
  await answerText(page, 'Otra Persona Ficticia');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reiniciar conversación' }).click();
  await expect(page.getByRole('button', { name: 'Comenzar conversación' })).toBeVisible();
});

test('demo pública: el panel y la API administrativa siguen protegidos', async ({ page, request }) => {
  await page.goto('/demo');
  for (const path of ['/', '/solicitudes', '/entrevistas', '/cuestionarios']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
  const r = await request.get('/api/applications');
  expect(r.status()).toBe(401);
});

test('demo pública: el navegador no puede falsificar la IP reenviada', async ({ request }) => {
  // El panel descarta estos headers y pone los propios: la API sigue respondiendo con normalidad.
  const r = await request.post('/api/sessions', {
    data: { acceptedNotice: true },
    headers: { 'x-adhera-client-ip': '198.51.100.1', 'x-adhera-proxy-key': 'clave-falsa' },
  });
  expect(r.status()).toBe(201);
});
