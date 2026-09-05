import { test, expect } from '@playwright/test';

test('rack boots honest, START opens the loop, STOP closes it', async ({ page }) => {
  await page.goto('/');
  // Honest at rest: no readings, camera off, START armed.
  await expect(page.getByRole('status', { name: /heart rate: no reading/i })).toContainText('--');
  await expect(page.getByRole('status', { name: /camera off/i })).toBeVisible();
  await expect(page.getByTestId('session-state')).toHaveText('idle');

  await page.getByRole('button', { name: 'START' }).click();
  // Fake video device: camera comes live (model + wasm load), state leaves idle.
  await expect(page.getByRole('status', { name: /camera live/i })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('session-state')).toHaveText(/warming|calibrating/);
  // Rules ran: the patch bay carries the goal preset, not dashes.
  await expect(page.getByText('Beat Hz').locator('..')).not.toContainText('--');
  // Synth ran: the analyser sees real samples (the first patch sets master gain 0.6; the worklet glides to it per block).
  await expect.poll(() => page.evaluate(() => window.__cymatyx?.audioLevel() ?? 0), { timeout: 10_000 }).toBeGreaterThan(0.01);

  await page.getByRole('button', { name: 'STOP' }).click();
  await expect(page.getByRole('status', { name: /camera off/i })).toBeVisible();
  await expect(page.getByTestId('session-state')).toHaveText('idle');
});
