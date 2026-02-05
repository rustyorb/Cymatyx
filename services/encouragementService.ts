import { ProviderConfig, GoalType } from '../types.ts';

const FALLBACK_LINES = [
  "Stay with the warmth—slow breath, let the waves do the work.",
  "Relax your shoulders, breathe deep, let sensation rise and linger.",
  "Ride the pulse; you're safe, centered, and in control.",
  "Let the rhythm carry you—no rush, just steady build and release.",
  "Exhale tension, inhale pleasure. You're allowed to enjoy this.",
];

const promptTemplate = (bpm: number, goal: GoalType) => `You are an intimate, supportive coach. Provide 1-2 sentences of encouraging, consensual, body-positive guidance. Keep it tasteful, non-graphic, warm. Style: JOI-like but clean. Use present tense.
Context: heart rate ~${Math.round(bpm)} BPM. Goal: ${goal}.`;

export const generateEncouragement = async (
  bpm: number,
  goal: GoalType,
  providerCfg?: ProviderConfig | null
): Promise<string> => {
  // If provider not ready, return a fallback line
  if (!providerCfg?.apiKey || !providerCfg?.baseUrl || !providerCfg?.model) {
    return FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (providerCfg.prefix) headers[providerCfg.authHeader || 'Authorization'] = `${providerCfg.prefix}${providerCfg.apiKey}`;
  else headers[providerCfg.authHeader || 'Authorization'] = providerCfg.apiKey;
  if (providerCfg.extraHeaders) Object.assign(headers, providerCfg.extraHeaders);

  try {
    const res = await fetch(`${providerCfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: providerCfg.model,
        temperature: 0.7,
        max_tokens: 80,
        messages: [
          { role: 'system', content: 'You are an intimate, supportive coach. Keep it consensual, non-graphic, body-positive, and brief (1-2 sentences).' },
          { role: 'user', content: promptTemplate(bpm, goal) }
        ]
      })
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('Encouragement call failed', res.status, text);
      return FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((c: any) => c.text || c).join('\n') : content;
    return (text || '').trim() || FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
  } catch (e) {
    console.error('Encouragement error', e);
    return FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
  }
};
