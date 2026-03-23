import { EntrainmentConfig, GoalType, ProviderConfig } from '../types.ts';
import { generateOfflineConfig, shouldUseOfflineFallback } from './therapeuticFallback.ts';
import { resolveApiKey } from './providers.ts';
import type { EntrainmentSource } from '../stores/useAudioStore.ts';

/** Result from config generation, tagged with its source */
export interface ConfigResult {
  config: EntrainmentConfig;
  source: EntrainmentSource;
}

const defaultConfig: EntrainmentConfig = {
  binauralBeatFreq: 10,
  carrierFreq: 200,
  visualPulseRate: 10,
  primaryColor: '#6366f1',
  breathingRate: 5,
  spatialPan: 0,
  inductionText: 'Welcome to Cymatyx.',
  explanation: 'Initializing bio-resonance sequence...'
};

const buildPrompt = (goal: GoalType, currentBpm: number, currentHrv: number, history: string[]) => `
You are Cymatyx, a closed-loop bio-resonance engine. Given the user's goal and vitals, output a JSON object with the following keys:
{
  "binauralBeatFreq": number (Hz),
  "carrierFreq": number (Hz),
  "visualPulseRate": number (Hz),
  "primaryColor": string (hex),
  "breathingRate": number (seconds per breath),
  "spatialPan": number (Hz),
  "inductionText": string,
  "explanation": string
}
Constraints:
- Keep binauralBeatFreq between 1 and 45 depending on goal.
- Keep carrierFreq between 100 and 600.
- visualPulseRate should roughly track binauralBeatFreq.
- Keep breathingRate between 3 and 8 seconds.
- Do not include any extra keys.

Goal: ${goal}
Current BPM: ${currentBpm}
HRV (SDNN): ${currentHrv}
Session History: ${history.join(', ') || 'none'}
Return ONLY valid JSON.`;

const parseJson = (text: string): EntrainmentConfig => {
  try {
    const parsed = JSON.parse(text);
    return {
      ...defaultConfig,
      ...parsed
    } as EntrainmentConfig;
  } catch (e) {
    console.warn('Failed to parse model JSON, using fallback', e);
    return defaultConfig;
  }
};

export const generateSessionConfig = async (
  goal: GoalType,
  currentBpm: number,
  currentHrv: number,
  history: string[],
  providerCfg?: ProviderConfig | null
): Promise<ConfigResult> => {
  if (goal === GoalType.SELF_LOVE || await shouldUseOfflineFallback(providerCfg)) {
    console.log('[Cymatyx] Using rule-based therapeutic fallback');
    return { config: generateOfflineConfig(goal, currentBpm, currentHrv), source: 'offline' };
  }

  // Resolve API key from vault (encrypted) or env var
  const apiKey = providerCfg.apiKey || await resolveApiKey(providerCfg.provider);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    if (providerCfg.prefix) headers[providerCfg.authHeader || 'Authorization'] = `${providerCfg.prefix}${apiKey}`;
    else headers[providerCfg.authHeader || 'Authorization'] = apiKey;
  }
  if (providerCfg.extraHeaders) Object.assign(headers, providerCfg.extraHeaders);

  try {
    const res = await fetch(`${providerCfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: providerCfg.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a biomedical signal engineer specializing in neural entrainment. Respond with ONLY JSON.' },
          { role: 'user', content: buildPrompt(goal, currentBpm, currentHrv, history) }
        ]
      })
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn('Model call failed', res.status, text, '— falling back to offline therapeutic logic');
      return { config: generateOfflineConfig(goal, currentBpm, currentHrv), source: 'offline' };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((c: any) => c.text || c).join('\n') : content;
    return { config: parseJson(text || '{}'), source: 'ai' };
  } catch (e) {
    console.error('Model invocation error', e, '— falling back to offline therapeutic logic');
    return { config: generateOfflineConfig(goal, currentBpm, currentHrv), source: 'offline' };
  }
};
