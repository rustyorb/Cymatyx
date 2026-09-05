import { describe, it, expect, vi, afterEach } from 'vitest';
import { discoverTts, synthesize } from '../../src/voice/tts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('tts jack', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('discovers Kokoro-shaped models and voices', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('/models') ? json({ data: [{ id: 'kokoro' }, { id: 'tts-1' }] }) : json({ voices: ['af_sky', 'am_adam'] }))),
    );
    const d = await discoverTts('http://localhost:8880/v1/');
    expect(d.models).toEqual(['kokoro', 'tts-1']);
    expect(d.voices).toEqual(['af_sky', 'am_adam']);
  });

  it('rejects on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)));
    await expect(discoverTts('http://x/v1')).rejects.toThrow(/HTTP 500/);
  });

  it('posts the OpenAI speech body and returns a blob', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }),
    );
    const blob = await synthesize({ baseUrl: 'http://localhost:8880/v1', model: 'kokoro', voice: 'af_sky' }, 'hello');
    expect(calls[0].url).toBe('http://localhost:8880/v1/audio/speech');
    expect(calls[0].body).toMatchObject({ model: 'kokoro', voice: 'af_sky', input: 'hello' });
    expect(blob.size).toBe(3);
  });
});
