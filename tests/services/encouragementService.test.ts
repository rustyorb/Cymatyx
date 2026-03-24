import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateEncouragement } from '../../services/encouragementService';
import { GoalType } from '../../types';
import type { ProviderConfig } from '../../types';

// Mock the providers module so resolveApiKey returns a test key
vi.mock('../../services/providers', () => ({
  resolveApiKey: vi.fn().mockResolvedValue('test-api-key'),
}));

const mockProvider: ProviderConfig = {
  provider: 'openai',
  baseUrl: 'https://api.test.com',
  apiKey: 'test-key',
  model: 'gpt-4',
  authHeader: 'Authorization',
  prefix: 'Bearer ',
};

describe('encouragementService', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns fallback when no provider config', async () => {
    const result = await generateEncouragement(72, GoalType.RELAXATION, null);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns fallback when provider has no baseUrl', async () => {
    const result = await generateEncouragement(72, GoalType.RELAXATION, {
      ...mockProvider,
      baseUrl: '',
    });
    expect(result).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns fallback when provider has no model', async () => {
    const result = await generateEncouragement(72, GoalType.RELAXATION, {
      ...mockProvider,
      model: undefined,
    });
    expect(result).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls API with correct URL and body', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Great job breathing deeply.' } }],
      }),
    });

    const result = await generateEncouragement(80, GoalType.FOCUS, mockProvider);
    expect(result).toBe('Great job breathing deeply.');
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.test.com/chat/completions');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('gpt-4');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].content).toContain('80');
  });

  it('sets Authorization header with prefix', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Keep going.' } }],
      }),
    });

    await generateEncouragement(72, GoalType.RELAXATION, mockProvider);
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer test-key');
  });

  it('returns fallback on HTTP error', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });

    const result = await generateEncouragement(72, GoalType.ENERGY, mockProvider);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns fallback on network error', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    const result = await generateEncouragement(72, GoalType.RELAXATION, mockProvider);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('handles array content format', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: [{ text: 'Part 1' }, { text: 'Part 2' }] } }],
      }),
    });

    const result = await generateEncouragement(72, GoalType.RELAXATION, mockProvider);
    expect(result).toBe('Part 1\nPart 2');
  });

  it('returns fallback for empty API response', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    });

    const result = await generateEncouragement(72, GoalType.RELAXATION, mockProvider);
    expect(result).toBeTruthy(); // Should get a fallback line
  });
});
