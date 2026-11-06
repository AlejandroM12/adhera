import { expect, test } from '@playwright/test';
import { answerChoice, answerText, expectQuestion, loginUI } from './helpers';

test('simulador y panel usables en mobile', async ({ page }) => {
  await page.goto('/simulador');
  await page.getByLabel('Entiendo y acepto usar datos ficticios en esta demo.').check();
  await page.getByRole('button', { name: 'Comenzar conversación' }).click();
  await answerText(page, 'Mobile Ficticio');
  await answerChoice(page, 'Individual');
  await expectQuestion(page, 'ciudad');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const width = await page.evaluate(() => window.innerWidth);
  expect(scrollWidth).toBeLessThanOrEqual(width);

  // Las conversaciones en curso no aparecen en "Enviadas", sí en la pestaña "En curso".
  await loginUI(page, '/solicitudes');
  await expect(page.getByRole('link', { name: /Valentina Ríos/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mobile Ficticio/ })).toHaveCount(0);
  await page.getByRole('tab', { name: /En curso/ }).click();
  await expect(page.getByRole('link', { name: /Mobile Ficticio/ }).first()).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Entrevistas' }).click();
  await expect(page).toHaveURL(/\/entrevistas/);
});
