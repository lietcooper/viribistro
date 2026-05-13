import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API_URL = 'http://127.0.0.1:3100';

export async function resetE2eState(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${API_URL}/__e2e/reset`);
  expect(res.ok()).toBeTruthy();
}

export async function getMenuItemId(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const res = await request.get(`${API_URL}/api/menu`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    items: Array<{ id: string; name: string }>;
  };
  const item = body.items.find((candidate) => candidate.name === name);
  if (!item) throw new Error(`Menu item not found: ${name}`);
  return item.id;
}

export async function signUp(page: Page, email: string): Promise<void> {
  await page.getByTestId('login-go-signup').click();
  await page.getByTestId('signup-name').fill('E2E Guest');
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill('correct horse battery staple');
  await page.getByTestId('signup-submit').click();
  await expect(page.getByText('AI Host')).toBeVisible();
}

export async function login(page: Page, email: string): Promise<void> {
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill('correct horse battery staple');
  await page.getByTestId('login-submit').click();
  await expect(page.getByText('AI Host')).toBeVisible();
}
