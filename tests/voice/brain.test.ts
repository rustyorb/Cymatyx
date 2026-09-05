import { describe, it, expect, vi, afterEach } from 'vitest';
import { discoverModels, generateLine } from '../../src/voice/brain';
import type { Moment } from '../../src/voice/lines';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const moment: Moment = { event: 'checkin', goal: 'FOCUS', minutes: 2, bpm: 70, hrv: null, coherence: 61, breath_rate: 6, rsa_baseline: null, band: 'mid', trend: 'flat' };

describe('brain jack', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists models from the OpenAI shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [{ id: 'llama3' }, { id: 'qwen' }] })));
    expect(await discoverModels('http://localhost:11434/v1')).toEqual(['llama3', 'qwen']);
  });

  it('sends the moment and returns the first line, unquoted', async () => {
    let body: { messages: { role: string; content: string }[] } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        body = JSON.parse(String(init.body));
        return json({ choices: [{ message: { content: '"Two minutes in, heart 70, coherence 61 — keep the breath long."\nSecond line' } }] });
      }),
    );
    const line = await generateLine({ baseUrl: 'http://localhost:11434/v1', model: 'llama3' }, moment);
    expect(line).toBe('Two minutes in, heart 70, coherence 61 — keep the breath long.');
    expect(body!.messages[0].role).toBe('system');
    expect(JSON.parse(body!.messages[1].content)).toMatchObject({ bpm: 70, coherence: 61 });
  });

  it('rejects on empty reply and on abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ choices: [{ message: { content: '' } }] })));
    await expect(generateLine({ baseUrl: 'http://x/v1', model: 'm' }, moment)).rejects.toThrow(/empty/);
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))),
    );
    await expect(generateLine({ baseUrl: 'http://x/v1', model: 'm' }, moment, AbortSignal.timeout(10))).rejects.toThrow();
  });
});
