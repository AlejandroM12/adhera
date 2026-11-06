import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ADVISOR = { email: 'asesor@adhera.demo', password: 'adhera-demo' };

export async function loginUI(page: Page, next = '/') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(ADVISOR.email);
  await page.getByLabel('Contraseña').fill(ADVISOR.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export async function loginAPI(request: APIRequestContext) {
  const r = await request.post('/api/auth/login', { data: ADVISOR });
  expect(r.ok()).toBeTruthy();
}

/** Responde la pregunta actual del simulador (texto/número o botón de opción). */
export async function answerText(page: Page, value: string) {
  await page.getByLabel('Tu respuesta').fill(value);
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
}

export async function answerChoice(page: Page, label: string) {
  await page.getByRole('group', { name: 'Opciones de respuesta' }).getByRole('button', { name: label, exact: true }).click();
}

export async function expectQuestion(page: Page, text: string | RegExp) {
  await expect(page.getByTestId('current-question')).toContainText(text);
}
