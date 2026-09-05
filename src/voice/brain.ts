import type { Moment } from './lines';

export interface BrainConfig {
  baseUrl: string;
  model: string;
}
const trim = (u: string) => u.replace(/\/+$/, '');

export const SYSTEM_PROMPT = [
  'You are the coach voice inside Cymatyx, a biofeedback instrument that reads heart rate from a webcam.',
  'You receive one JSON "moment" with live numbers. Reply with ONE sentence, at most 25 words, plain text, no quotes, no emoji.',
  'Only mention numbers that appear in the moment; never invent, round or estimate; never mention a value that is null.',
  'No medical, health-outcome or diagnostic claims of any kind.',
  'Tone by band: low = steady and unhurried, no judgment; mid = encouraging; high = quiet affirmation.',
  'Events: calibration_start = ask them to breathe with the ring; first_lock = say you have their pulse; active_start = settle in;',
  'band_change = acknowledge the change; checkin = brief status; session_end = brief close using avgBpm and peakCoherence.',
].join(' ');

/** GET /models → ids (Ollama and LM Studio both answer the OpenAI shape). */
export async function discoverModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${trim(baseUrl)}/models`, { signal });
  if (!res.ok) throw new Error(`Brain models: HTTP ${res.status}`);
  const j = (await res.json()) as { data?: { id: string }[] };
  return (j.data ?? []).map((m) => m.id).filter(Boolean);
}

/** POST /chat/completions → one line of text (unvalidated; the coach validates). */
export async function generateLine(cfg: BrainConfig, moment: Moment, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${trim(cfg.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(moment) },
      ],
      temperature: 0.7,
      max_tokens: 60,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Brain: HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (j.choices?.[0]?.message?.content ?? '')
    .trim()
    .split('\n')[0]
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
  if (!text) throw new Error('Brain: empty reply');
  return text;
}
