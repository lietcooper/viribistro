import { expect, test } from '@playwright/test';
import { getMenuItemId, resetE2eState, signUp } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetE2eState(request);
});

test('signup, menu cart sync, checkout, and order history', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const burgerId = await getMenuItemId(request, 'Wagyu Beef Burger');

  await page.goto('/');
  await signUp(page, email);

  await page.getByRole('tab', { name: /Menu/ }).click();
  await expect(page.getByText('Wagyu Beef Burger')).toBeVisible();
  await page.getByTestId('menu-search').fill('wagyu');
  await expect(page.getByText('Wagyu Beef Burger')).toBeVisible();
  await page.getByTestId(`menu-add-${burgerId}`).click();

  await page.getByTestId('open-cart').first().click();
  await expect(page.getByTestId('cart-drawer')).toBeVisible();
  await expect(page.getByTestId('cart-list').getByText('Wagyu Beef Burger')).toBeVisible();

  await page.reload();
  await expect(page.getByText('AI Host', { exact: true })).toBeVisible();
  await page.getByTestId('open-cart').first().click();
  await expect(page.getByTestId('cart-list').getByText('Wagyu Beef Burger')).toBeVisible();

  await page.getByTestId(`cart-row-increment-${burgerId}`).click();
  await expect(page.getByTestId(`cart-row-qty-${burgerId}`)).toContainText('2');
  await page.getByTestId(`cart-row-decrement-${burgerId}`).click();
  await expect(page.getByTestId(`cart-row-qty-${burgerId}`)).toContainText('1');

  await page.getByTestId('cart-checkout').click();
  await expect(page.getByText(/order.*confirmed|order.*placed/i)).toBeVisible();

  await page.getByRole('tab', { name: /Orders/ }).click();
  await expect(page.getByTestId('orders-list')).toBeVisible();
  await expect(page.getByText(/Wagyu Beef Burger/i)).toBeVisible();
});
