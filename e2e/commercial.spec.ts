import { expect, test } from '@playwright/test';
import { loginAPI, loginUI } from './helpers';

// Usa el seed demo de la base de pruebas (recreada en cada `pnpm test:e2e`).

test('dashboard comercial: indicadores, embudo, entrevistas y acción rápida "Asignarme"', async ({ page }) => {
  await loginUI(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Laura');
  await expect(page.getByTestId('kpi-pendingReview')).toHaveText(/\d+/);
  await expect(page.getByTestId('kpi-completionRate')).toHaveText(/\d+%/);
  await expect(page.getByTestId('funnel')).toContainText('Enviaron la solicitud');
  await expect(page.getByTestId('upcoming-interviews')).toContainText('Joaquín Herrera');
  await expect(page.getByTestId('abandoned')).toContainText('Carolina Suárez');

  const row = page.getByTestId('to-review').getByRole('listitem').filter({ hasText: 'Tomás Acosta' });
  await row.getByRole('button', { name: 'Asignarme' }).click();
  await expect(row).toContainText('Laura Méndez');
});

test('listado separa enviadas, en curso y abandonadas', async ({ page }) => {
  await loginUI(page, '/solicitudes');
  const table = page.getByTestId('applications-table');
  await expect(table).toContainText('Valentina Ríos');
  await expect(table).not.toContainText('Carolina Suárez');

  await page.getByRole('tab', { name: /En curso/ }).click();
  await expect(table).toContainText('Renata Vega');
  await expect(table).not.toContainText('Carolina Suárez');

  await page.getByRole('tab', { name: /Abandonadas/ }).click();
  await expect(page).toHaveURL(/view=abandoned/);
  const row = table.getByRole('row').filter({ hasText: 'Carolina Suárez' });
  await expect(row).toContainText('Abandonada');
  await expect(row).toContainText('5 respuestas');
  await expect(table).not.toContainText('Renata Vega');
});

test('ficha como perfil comercial con etiquetas profesionales y respuestas originales', async ({ page }) => {
  await loginUI(page, '/solicitudes/seed-app-03');
  await expect(page.getByTestId('application-name')).toHaveText('Mateo Giménez');
  const profile = page.getByTestId('summary');
  await expect(profile.getByTestId('profile-coverage_type')).toContainText('Tipo de cobertura');
  await expect(profile.getByTestId('profile-coverage_type')).toContainText('Empresa');
  await expect(profile.getByTestId('profile-members_count')).toContainText('18');
  await expect(profile).not.toContainText('¿'); // sin el texto de las preguntas
  await page.getByRole('button', { name: /Ver respuestas originales/ }).click();
  await expect(page.getByTestId('answers')).toContainText('¿Cuántas personas integrarían el plan?');

  // Abandonada: aviso con la oportunidad de recuperación
  await page.goto('/solicitudes/seed-app-18');
  await expect(page.getByRole('status').filter({ hasText: 'Conversación abandonada' })).toContainText('contactar por mensajería');
});

test('editor sin valores internos: claves y opciones se generan solas', async ({ page, request }) => {
  page.on('dialog', (d) => d.accept());
  await loginUI(page, '/cuestionarios');
  await expect(page.getByRole('button', { name: /Versión 1/ })).toBeVisible();
  await page.getByRole('button', { name: /Nuevo borrador desde/ }).click();
  await expect(page.getByText('Listo para publicar.')).toBeVisible();

  await page.getByRole('button', { name: 'Agregar pregunta' }).click();
  const editors = page.getByTestId('question-editor');
  const last = editors.last();
  // Validación en vivo, en lenguaje simple
  await expect(page.getByTestId('draft-errors')).toContainText('Pregunta 9: escribí el texto de la pregunta.');
  await last.getByLabel('Texto pregunta 9').fill('¿Cómo nos conociste?');
  await last.getByLabel('Tipo de respuesta').selectOption('single_choice');
  await last.getByLabel('Opción 1 de la pregunta 9').fill('Recomendación');
  await last.getByLabel('Opción 2 de la pregunta 9').fill('Redes sociales');
  await last.getByLabel('Etiqueta en la ficha (opcional)').fill('Origen');
  await last.getByLabel('Mostrar esta pregunta').selectOption({ label: 'Sólo según la respuesta a «¿Qué tipo de cobertura estás buscando?»' });
  await expect(page.getByTestId('draft-errors')).toContainText('Pregunta 9: elegí al menos una respuesta');
  await last.getByRole('checkbox', { name: 'Familiar' }).check();
  await last.getByText('Avanzado').click();
  await expect(last).toContainText('como_nos_conociste');
  await expect(page.getByTestId('draft-errors')).toHaveCount(0);

  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado.')).toBeVisible();

  // Lo guardado tiene claves internas generadas automáticamente
  await loginAPI(request);
  const detail = await (await request.get('/api/questionnaires/seed-questionnaire')).json();
  const draft = detail.versions.find((v: { status: string }) => v.status === 'DRAFT');
  const q = draft.questions.find((x: { key: string }) => x.key === 'como_nos_conociste');
  expect(q.shortLabel).toBe('Origen');
  expect(q.options).toEqual([
    { value: 'recomendacion', label: 'Recomendación' },
    { value: 'redes_sociales', label: 'Redes sociales' },
  ]);
  expect(q.condition).toEqual({ questionKey: 'coverage_type', in: ['family'] });

  // Descartar deja la versión publicada intacta
  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByRole('button', { name: /Nuevo borrador desde/ })).toBeVisible();
  const after = await (await request.get('/api/questionnaires/seed-questionnaire')).json();
  expect(after.versions.some((v: { status: string }) => v.status === 'DRAFT')).toBe(false);
});
