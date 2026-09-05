import { test, expect } from '@playwright/test';

// Point both jacks at the dev server's fake providers before the app boots.
const MOCK = 'http://localhost:3000/mock/v1';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ mock }) => {
      localStorage.setItem(
        'cymatyx-voice-settings',
        JSON.stringify({
          state: {
            tts: { enabled: true, baseUrl: mock, model: 'kokoro', voice: 'af_sky' },
            brain: { mode: 'llm', baseUrl: mock, model: 'mock-model' },
            coach: { enabled: true, intervalS: 90 },
          },
          version: 0,
        }),
      );
    },
    { mock: MOCK },
  );
});

test('rack boots honest, START opens the loop and lights the jacks, STOP closes it', async ({ page }) => {
  await page.goto('/');
  // Honest at rest: no readings, camera off, START armed, jacks dark, coach strip empty.
  await expect(page.getByRole('status', { name: /heart rate: no reading/i })).toContainText('--');
  await expect(page.getByRole('status', { name: /camera off/i })).toBeVisible();
  await expect(page.getByTestId('session-state')).toHaveText('idle');
  await expect(page.getByRole('status', { name: /voice off/i })).toBeVisible();
  await expect(page.getByTestId('coach-strip')).toHaveText('--');

  await page.getByRole('button', { name: 'START' }).click();
  // Fake video device: camera comes live (model + wasm load), state leaves idle.
  await expect(page.getByRole('status', { name: /camera live/i })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('session-state')).toHaveText(/warming|calibrating/);
  // Rules ran: the patch bay carries the goal preset, not dashes.
  await expect(page.getByText('Beat Hz').locator('..')).not.toContainText('--');
  // Synth ran: the analyser sees real samples (the first patch sets master gain 0.6; the worklet glides to it per block).
  await expect.poll(() => page.evaluate(() => window.__cymatyx?.audioLevel() ?? 0), { timeout: 10_000 }).toBeGreaterThan(0.01);
  // Jacks were probed on START and the fake servers answered.
  await expect(page.getByRole('status', { name: /voice ok/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('status', { name: /brain ok/i })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'STOP' }).click();
  await expect(page.getByRole('status', { name: /camera off/i })).toBeVisible();
  await expect(page.getByTestId('session-state')).toHaveText('idle');
});

test('voice and brain jack Test buttons speak and compose through the fake providers', async ({ page }) => {
  await page.goto('/');
  // Voice jack: Test speaks the fixed test line through the TTS jack and plays it (0.3 s fake WAV).
  await page.getByRole('region', { name: 'Voice jack' }).getByRole('button', { name: 'Test' }).click();
  await expect(page.getByTestId('coach-strip')).toContainText('Voice jack test', { timeout: 10_000 });
  await expect(page.getByRole('status', { name: /voice ok/i })).toBeVisible();
  await expect.poll(() => page.getByTestId('coach-strip').getAttribute('data-speaking'), { timeout: 10_000 }).toBe('false');
  // Brain jack: Fetch lists the fake models; Test composes one line and shows it.
  const brain = page.getByRole('region', { name: 'Brain jack' });
  await brain.getByRole('button', { name: 'Fetch' }).click();
  await expect(page.getByRole('status', { name: /brain ok/i })).toBeVisible({ timeout: 10_000 });
  await brain.getByRole('button', { name: 'Test' }).click();
  await expect(page.getByTestId('brain-test-result')).toContainText('Mock brain', { timeout: 10_000 });
});
