import { expect, test } from '@playwright/test';
import { answerChoice, answerText, expectQuestion, loginUI } from './helpers';

test('flujo principal: simulador → refresh → finalizar → solicitudes → ficha → gestión', async ({ page }) => {
  const name = `Prueba E2E ${Date.now()}`;

  // 1. Interesado inicia y acepta el aviso
  await page.goto('/simulador');
  await page.getByLabel('Entiendo y acepto usar datos ficticios en esta demo.').check();
  await page.getByRole('button', { name: 'Comenzar conversación' }).click();

  await expectQuestion(page, '¿Cómo te llamás?');
  await answerText(page, name);
  await expectQuestion(page, 'tipo de cobertura');
  await answerChoice(page, 'Familiar');
  await expectQuestion(page, 'Cuántas personas');

  // Validación del motor: número fuera de rango
  await answerText(page, '1');
  await expect(page.getByTestId('composer').getByRole('alert')).toContainText('El mínimo es 2');
  await answerText(page, '4');
  await expectQuestion(page, 'ciudad');
  await expect(page.getByTestId('progress')).toHaveText(/3 de \d+/);

  // 2. Refrescar a mitad de sesión y continuar sin perder respuestas
  await page.reload();
  await expect(page.getByTestId('answer-full_name')).toContainText(name);
  await expect(page.getByTestId('answer-coverage_type')).toContainText('Familiar');
  await expect(page.getByTestId('answer-members_count')).toContainText('4');
  await expectQuestion(page, 'ciudad');

  await answerText(page, 'Ciudad Ficticia');
  await answerChoice(page, 'Correo electrónico');
  await answerChoice(page, 'Tarde (12 a 18 h)');
  await expectQuestion(page, 'observación general');
  await answerChoice(page, 'Sí');
  await expectQuestion(page, 'Contanos tu observación');
  await answerText(page, 'Prefiero contacto por la tarde.');

  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByTestId('completed')).toContainText('Recibimos tu solicitud');

  // 3. Asesor ve la nueva solicitud sin reiniciar servicios: primero en "Para revisar" y en el listado
  await loginUI(page, '/');
  await expect(page.getByTestId('to-review')).toContainText(name);
  await page.goto('/solicitudes');
  // Las enviadas más recientes van primero
  await expect(page.getByTestId('applications-table').getByRole('row').nth(1)).toContainText(name);
  const row = page.getByTestId('applications-table').getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('Pendiente de revisión');
  await row.getByRole('link', { name }).click();

  // 4. Ficha con respuestas originales en orden
  await expect(page.getByTestId('application-name')).toHaveText(name);
  await expect(page.getByTestId('summary')).toContainText('Ciudad Ficticia');
  // Una solicitud enviada no ofrece volver a "En curso"
  await expect(page.getByLabel('Estado').locator('option[value="IN_PROGRESS"]')).toHaveCount(0);
  await page.getByRole('tab', { name: /Respuestas/ }).click();
  const values = page.getByTestId('answers').getByTestId('answer-value');
  await expect(values).toHaveText([
    name, 'Familiar', '4', 'Ciudad Ficticia', 'Correo electrónico', 'Tarde (12 a 18 h)', 'Sí', 'Prefiero contacto por la tarde.',
  ]);

  // 5. Nota, asignación y entrevista; persisten tras refrescar
  await page.getByLabel('Asesor responsable').selectOption({ label: 'Martín Paz' });
  await expect(page.getByLabel('Asesor responsable')).toHaveValue(/.+/);

  await page.getByRole('tab', { name: /Notas/ }).click();
  await page.getByLabel('Nueva nota interna').fill('Llamar el jueves por la tarde.');
  await page.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.getByTestId('notes')).toContainText('Llamar el jueves por la tarde.');

  await page.getByRole('tab', { name: /Entrevistas/ }).click();
  await page.getByRole('button', { name: 'Programar entrevista' }).click();
  await expect(page.getByTestId('interview-card')).toContainText('Programada');
  await expect(page.locator('main')).toContainText('Entrevista programada');

  // Regresión: editar después de "Marcar realizada" debe partir del estado actual
  await page.getByRole('button', { name: 'Marcar realizada' }).click();
  await expect(page.getByTestId('interview-card')).toContainText('Realizada');
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByTestId('interview-card').getByLabel('Estado')).toHaveValue('COMPLETED');
  await page.getByTestId('interview-card').getByLabel('Próximo paso').fill('Enviar propuesta');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByTestId('interview-card')).toContainText('Realizada');
  await expect(page.getByTestId('interview-card')).toContainText('Enviar propuesta');

  await page.reload();
  await expect(page.getByLabel('Asesor responsable').locator('option:checked')).toHaveText('Martín Paz');
  await expect(page.getByLabel('Estado')).toHaveValue('INTERVIEW_SCHEDULED');
  await page.getByRole('tab', { name: /Notas/ }).click();
  await expect(page.getByTestId('notes')).toContainText('Llamar el jueves por la tarde.');
  await page.getByRole('tab', { name: /Historial/ }).click();
  await expect(page.locator('main')).toContainText('Respondió «¿En qué ciudad vivís?»');
  await expect(page.locator('main')).toContainText('Programó una entrevista');
  await expect(page.locator('main')).toContainText('Agregó una nota interna');

  // La agenda refleja la entrevista (ya realizada)
  await page.getByRole('link', { name: 'Entrevistas' }).first().click();
  await page.getByRole('tab', { name: 'Realizadas' }).click();
  await expect(page.locator('main')).toContainText(name);
});

test('rutas de asesor redirigen al login sin sesión', async ({ page }) => {
  await page.goto('/solicitudes');
  await expect(page).toHaveURL(/\/login\?next=%2Fsolicitudes/);
});
