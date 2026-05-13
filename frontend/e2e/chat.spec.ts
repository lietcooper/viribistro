import { expect, test } from '@playwright/test';
import { getMenuItemId, resetE2eState, signUp } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetE2eState(request);
});

test('chat can add to cart, clarify ambiguity, and reset history', async ({
  page,
  request,
}) => {
  const email = `chat-e2e-${Date.now()}@example.com`;
  const burgerId = await getMenuItemId(request, 'Wagyu Beef Burger');

  await page.goto('/');
  await signUp(page, email);

  await page.getByTestId('chat-input').fill('add the wagyu burger');
  await page.getByTestId('chat-send').click();
  await expect(page.getByText(/Added a Wagyu Beef Burger/i)).toBeVisible();
  await expect(page.getByTestId('cart-update-card')).toBeVisible();

  await page.getByTestId('open-cart').first().click();
  await expect(page.getByTestId(`cart-row-qty-${burgerId}`)).toContainText('1');
  await page.getByTestId('cart-overlay').click({ position: { x: 12, y: 12 } });

  await page.getByTestId('chat-input').fill('add wine');
  await page.getByTestId('chat-send').click();
  await expect(page.getByText(/House Red Wine/i)).toBeVisible();
  await expect(page.getByText(/House White Wine/i)).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('chat-new').click();
  await expect(page.getByText('How can I help?')).toBeVisible();
});

test('chat shows fallback when AI is unavailable', async ({ page, request }) => {
  await resetE2eState(request);
  await request.post('http://127.0.0.1:3100/__e2e/reset');
  await page.goto('/');
  await signUp(page, `ai-down-${Date.now()}@example.com`);

  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AI_NOT_CONFIGURED', message: 'AI chat is unavailable' },
      }),
    });
  });

  await page.getByTestId('chat-input').fill('hello');
  await page.getByTestId('chat-send').click();
  await expect(page.getByText(/couldn't reach the bistro/i)).toBeVisible();
});
