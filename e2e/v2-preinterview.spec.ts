import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { answerChoice, answerText, expectQuestion, loginAPI, loginUI } from './helpers';

/**
 * Preentrevista de salud v2 (todo con datos ficticios). Corre en el proyecto "v2", después de las
 * pruebas de v1, porque importa y publica la nueva versión del cuestionario.
 */
test.describe.configure({ mode: 'serial' });

async function questionnaireId(request: APIRequestContext) {
  const r = await request.get('/api/questionnaires');
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { id: string }[])[0]!.id;
}

async function special(page: Page, label: 'No sé' | 'Prefiero no responder') {
  await page.getByRole('group', { name: 'Otras respuestas' }).getByRole('button', { name: label, exact: true }).click();
}

async function multi(page: Page, labels: string[], other?: string) {
  const group = page.getByRole('group', { name: 'Opciones de respuesta' });
  for (const l of labels) await group.getByRole('button', { name: l, exact: true }).click();
  if (other) await page.getByLabel('Especificá: Otro').fill(other);
  await page.getByRole('button', { name: 'Continuar' }).click();
}

const NAME = `Ana V2 ${Date.now() % 100000}`;

test('importar la plantilla como borrador, publicarla y crear los casos de ejemplo sin duplicar', async ({ page, request }) => {
  await loginUI(page, '/cuestionarios');
  await page.getByTestId('template-actions').getByRole('button', { name: 'Importar como borrador' }).click();
  await expect(page.getByTestId('template-actions').getByRole('status')).toContainText('Se creó el borrador');
  // El editor conserva la estructura de la plantilla: guardar no la pierde.
  await expect(page.getByText('Plantilla · por integrante').first()).toBeVisible();
  await loginAPI(request);
  const id = await questionnaireId(request);
  const detail = await (await request.get(`/api/questionnaires/${id}`)).json();
  const draft = detail.versions.find((v: { status: string }) => v.status === 'DRAFT');
  expect(draft.title).toBe('Preentrevista de salud');
  expect(draft.errors).toEqual([]);
  // Guardar el borrador desde el editor (ida y vuelta) mantiene la configuración.
  await page.getByLabel('Texto pregunta 1', { exact: true }).fill('¿Cuál es tu nombre? (ficticio)');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador guardado.')).toBeVisible();
  const after = await (await request.get(`/api/questionnaires/${id}`)).json();
  const saved = after.versions.find((v: { status: string }) => v.status === 'DRAFT');
  expect(saved.questions.find((q: { key: string }) => q.key === 'h_history').meta.repeat).toBe('all_members');
  expect(saved.errors).toEqual([]);

  const pub = await request.post(`/api/questionnaires/${id}/publish`);
  expect(pub.ok()).toBeTruthy();

  const first = await (await request.post('/api/questionnaires/templates/health-v2/examples')).json();
  expect(first).toEqual({ created: 4, total: 4 });
  const again = await (await request.post('/api/questionnaires/templates/health-v2/examples')).json();
  expect(again).toEqual({ created: 0, total: 4 });
  const list = await (await request.get('/api/applications', { params: { search: 'Mariela Duarte' } })).json();
  expect(list.items).toHaveLength(1);
});

test('conversación v2: validaciones, confirmaciones, integrantes, "No sé" y corrección en la revisión', async ({ page }) => {
  await page.goto('/demo');
  await page.getByLabel('Entiendo y acepto usar datos ficticios en esta demo.').check();
  await page.getByRole('button', { name: 'Comenzar conversación' }).click();

  // 1. Identificación y contacto
  await expect(page.getByTestId('section-divider').first()).toContainText('Identificación y contacto');
  await expectQuestion(page, 'nombre');
  await answerText(page, NAME.split(' ')[0]!);
  await answerText(page, NAME.split(' ').slice(1).join(' '));
  await answerText(page, '12'); // DNI inválido
  await expect(page.getByTestId('composer').getByRole('alert')).toContainText('7 u 8 dígitos');
  await answerText(page, '30.123.456');
  await answerText(page, '5/3/90'); // año de 2 dígitos sin ambigüedad: no repregunta
  await expectQuestion(page, 'sexo');
  await expect(page.getByTestId('answer-birth_date')).toContainText('05/03/1990');
  await answerChoice(page, 'F (femenino)');
  await answerText(page, '2345-6789'); // sin código de área
  await expect(page.getByTestId('composer').getByRole('alert')).toContainText('código de área');
  await answerText(page, '11 2345-6789');
  await answerText(page, 'ana@gmial.com');
  await expect(page.getByTestId('confirmation')).toContainText('¿Quisiste escribir ana@gmail.com?');
  await page.getByRole('group', { name: 'Confirmar respuesta' }).getByRole('button', { name: 'ana@gmail.com', exact: true }).click();
  await expect(page.getByTestId('answer-email')).toContainText('ana@gmail.com');
  await answerChoice(page, 'WhatsApp');
  await answerChoice(page, 'Mañana (9 a 12 h)');

  // 2. Domicilio: provincia (lista) y localidad con búsqueda tolerante a errores
  await page.getByLabel('Tu respuesta').selectOption({ label: 'Córdoba' });
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await page.getByLabel('Tu respuesta').fill('rio cuatro');
  await expect(page.getByRole('list', { name: 'Localidades sugeridas' })).toContainText('Río Cuarto');
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await expect(page.getByTestId('confirmation')).toContainText('¿Cuál de estas localidades es la tuya?');
  await page.getByRole('group', { name: 'Confirmar respuesta' }).getByRole('button', { name: /^Río Cuarto/ }).first().click();
  await expect(page.getByTestId('answer-locality')).toContainText('Río Cuarto, Córdoba');
  await answerText(page, 'Calle Ficticia 123');
  await page.getByRole('button', { name: 'Omitir' }).click(); // piso y depto.
  await special(page, 'No sé'); // código postal

  // 3. Cobertura y grupo familiar
  await answerChoice(page, 'No tengo cobertura');
  await answerChoice(page, 'Jubilado/a o pensionado/a');
  await answerChoice(page, 'Con grupo familiar');
  await answerText(page, '1');
  await expectQuestion(page, 'Integrante 1: ¿qué vínculo tiene con vos?');
  await answerChoice(page, 'Hijo/a');
  await answerText(page, 'Sol Prueba');
  await expectQuestion(page, '¿Cuál es el DNI de Sol Prueba?');
  await answerText(page, '55.111.222');
  await answerText(page, '05/05/2015');
  await special(page, 'Prefiero no responder');

  // 4-9. Salud de la titular (segunda persona)
  await expect(page.getByTestId('current-question')).toContainText('Ahora unas preguntas de salud sobre vos');
  await answerChoice(page, 'No');
  await special(page, 'No sé'); // enfermedad crónica: respuesta válida
  await expectQuestion(page, 'internado/a');
  await answerChoice(page, 'No');
  await answerChoice(page, 'Sí'); // cirugías
  await answerText(page, 'Apéndice en 2019 (dato ficticio)');
  await answerChoice(page, 'No'); // medicación
  await multi(page, ['Kinesiología o rehabilitación', 'Ninguno']); // "Ninguno" reemplaza a lo anterior
  await expect(page.getByTestId('answer-h_treatments#m0')).toContainText('Ninguno');
  await expectQuestion(page, '¿Estás cursando un embarazo?');
  await answerChoice(page, 'No corresponde');
  await multi(page, ['Diabetes', 'Otro'], 'Asma (ficticio)');
  await page.getByRole('button', { name: 'Omitir' }).click();
  await answerChoice(page, 'No'); // pendientes

  // Salud de la hija, por separado
  await expect(page.getByTestId('section-divider').last()).toContainText('Sol Prueba');
  await expectQuestion(page, '¿Sol Prueba tiene antecedentes médicos que quiera declarar?');
  await answerChoice(page, 'Sí');
  await multi(page, ['Respiratorios']);
  await page.getByRole('button', { name: 'Omitir' }).click();
  for (let i = 0; i < 4; i++) await answerChoice(page, 'No'); // crónica, internación, cirugía, medicación
  await multi(page, ['Ninguno']);
  await expectQuestion(page, '¿Sol Prueba está cursando un embarazo?'); // 11 años: se pregunta, con "No corresponde"
  await answerChoice(page, 'No corresponde');
  await multi(page, ['Ninguno conocido']);
  await answerChoice(page, 'No');

  // 10. Revisión con corrección y consentimiento
  await expect(page.getByTestId('review-panel')).toContainText('Resumen de tus respuestas');
  await expect(page.getByTestId('review-panel')).toContainText('Sol Prueba');
  await page.getByTestId('review-phone').getByRole('button', { name: /Corregir/ }).click();
  await expect(page.getByTestId('composer')).toContainText('Corrigiendo');
  await page.getByLabel('Tu respuesta').fill('351 555-1234');
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await expect(page.getByTestId('review-phone')).toContainText('351');
  await answerChoice(page, 'Sí'); // revisión confirmada
  await expect(page.getByTestId('review-panel')).toHaveCount(0);
  await answerChoice(page, 'Sí'); // consentimiento
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByTestId('completed')).toContainText('Recibimos tu solicitud');
});

test('demo: completar con datos ficticios hasta la revisión', async ({ page }) => {
  await page.goto('/demo');
  await page.getByLabel('Entiendo y acepto usar datos ficticios en esta demo.').check();
  await page.getByRole('button', { name: 'Comenzar conversación' }).click();
  await page.getByRole('button', { name: 'Completar con datos ficticios' }).click();
  await expect(page.getByTestId('review-panel')).toBeVisible({ timeout: 45_000 });
  await answerChoice(page, 'Sí');
  await answerChoice(page, 'Sí');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByTestId('completed')).toBeVisible();
});

test('ficha profesional: secciones, integrantes por separado, revisión y observaciones sin modificar la declaración', async ({ page }) => {
  await loginUI(page, '/solicitudes/seed-v2-app-03');
  await expect(page.getByTestId('preinterview-notice')).toContainText('Preentrevista, no declaración jurada');
  await expect(page.getByTestId('dossier')).toBeVisible();
  await expect(page.getByTestId('review-contradictions')).toContainText('Declarado como hijo/a');
  await expect(page.getByTestId('review-missing')).toContainText('Prefirió no responder');
  await expect(page.getByTestId('review-clarifications')).toContainText('Paraje El Ficticio');
  await expect(page.getByTestId('member-m0')).toContainText('Titular');
  await expect(page.getByTestId('member-m1')).toContainText('Abril Benítez');
  // La salud de la hija está en su propia tarjeta.
  await expect(page.getByTestId('member-m1').getByTestId('dossier-h_history#m1')).toBeVisible();

  const dni = page.getByTestId('dossier-dni');
  await expect(dni).toContainText('35.111.222');
  await dni.getByRole('button', { name: 'Agregar observación: DNI' }).click();
  await dni.getByLabel('Observación sobre DNI').fill('Pedir foto del DNI en la reunión.');
  await dni.getByLabel('Tipo de observación').selectOption('CLARIFICATION');
  await dni.getByRole('button', { name: 'Guardar' }).click();
  await expect(dni.getByTestId('observation')).toContainText('Aclaración pendiente');
  await expect(page.getByTestId('review-clarifications')).toContainText('Pedir foto del DNI');
  // La respuesta original no cambia.
  await expect(dni).toContainText('35.111.222');
  await dni.getByRole('button', { name: 'Marcar como resuelta' }).click();
  await expect(dni.getByTestId('observation')).toContainText('Aclaración resuelta');
  await expect(page.getByTestId('review-clarifications')).not.toContainText('Pedir foto del DNI');
});

test('la conversación completada muestra corrección, confirmación y texto original', async ({ page, request }) => {
  await loginAPI(request);
  const list = await (await request.get('/api/applications', { params: { search: NAME } })).json();
  expect(list.items).toHaveLength(1);
  await loginUI(page, `/solicitudes/${list.items[0].id}`);
  const phone = page.getByTestId('dossier-phone');
  await expect(phone).toContainText('Corregido');
  await expect(phone).toContainText('Antes:');
  await expect(page.getByTestId('dossier-email')).toContainText('Confirmado');
  await expect(page.getByTestId('dossier-email')).toContainText('Escribió: «ana@gmial.com»');
  await expect(page.getByTestId('dossier-locality')).toContainText('Río Cuarto');
  await expect(page.getByTestId('dossier-h_chronic#m0')).toContainText('No sé');
  await expect(page.getByTestId('member-m1')).toContainText('Sol Prueba');
});

test('PDF A4 sólo para asesores, sin caché y con registro de la exportación', async ({ page, request, playwright }) => {
  await loginAPI(request);
  const r = await request.get('/api/applications/seed-v2-app-02/pdf');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('application/pdf');
  expect(r.headers()['cache-control']).toContain('no-store');
  expect(r.headers()['content-disposition']).toContain('preentrevista-seed-v2-app-02.pdf');
  const body = await r.body();
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  const activity = await (await request.get('/api/applications/seed-v2-app-02/activity')).json();
  expect(activity.some((e: { kind: string }) => e.kind === 'PDF_EXPORTED')).toBe(true);
  // Sin sesión: no hay acceso.
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  expect((await anon.get('/api/applications/seed-v2-app-02/pdf')).status()).toBe(401);
  await anon.dispose();
  // El enlace aparece en la ficha.
  await loginUI(page, '/solicitudes/seed-v2-app-02');
  await expect(page.getByTestId('pdf-link')).toHaveAttribute('href', '/api/applications/seed-v2-app-02/pdf');
});

test('catálogo público de localidades limitado a datos geográficos', async ({ request }) => {
  const r = await request.get('/api/catalog/localities', { params: { province: '14', q: 'rio cuatro' } });
  expect(r.ok()).toBeTruthy();
  const list = await r.json();
  expect(list[0]).toEqual({ id: expect.any(String), name: 'Río Cuarto', department: 'Río Cuarto' });
  expect((await request.get('/api/catalog/localities', { params: { province: '99', q: 'x' } })).status()).toBe(400);
});
