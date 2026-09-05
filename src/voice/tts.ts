export interface TtsConfig {
  baseUrl: string;
  model: string;
  voice: string;
}
const trim = (u: string) => u.replace(/\/+$/, '');
const ids = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((x) => (typeof x === 'string' ? x : ((x as { id?: string; name?: string }).id ?? (x as { name?: string }).name ?? '')))
    .filter(Boolean);

/** GET /models + /audio/voices (Kokoro-FastAPI shapes: {data:[{id}]} and {voices:[...]}). */
export async function discoverTts(baseUrl: string, signal?: AbortSignal): Promise<{ models: string[]; voices: string[] }> {
  const base = trim(baseUrl);
  const [m, v] = await Promise.all([fetch(`${base}/models`, { signal }), fetch(`${base}/audio/voices`, { signal })]);
  if (!m.ok) throw new Error(`TTS models: HTTP ${m.status}`);
  if (!v.ok) throw new Error(`TTS voices: HTTP ${v.status}`);
  const mj = (await m.json()) as { data?: unknown; models?: unknown };
  const vj = (await v.json()) as { voices?: unknown } | unknown[];
  return { models: ids(mj.data ?? mj.models), voices: ids(Array.isArray(vj) ? vj : vj.voices) };
}

/** POST /audio/speech → audio Blob. */
export async function synthesize(cfg: TtsConfig, text: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${trim(cfg.baseUrl)}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, voice: cfg.voice, input: text, response_format: 'mp3' }),
    signal,
  });
  if (!res.ok) throw new Error(`TTS speech: HTTP ${res.status}`);
  return res.blob();
}
