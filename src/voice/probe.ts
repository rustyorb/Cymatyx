import { bus } from '../bus/store';
import { settings } from './settings';
import { discoverTts } from './tts';
import { discoverModels } from './brain';

/** Discovery → lamps. A lamp is 'ok' only because the server answered. Returns the lists for the jacks. */
export async function probeTts(): Promise<{ models: string[]; voices: string[] } | null> {
  const s = settings.getState().tts;
  if (!s.enabled) {
    bus.getState().set('tts_status', 'off');
    return null;
  }
  try {
    const d = await discoverTts(s.baseUrl, AbortSignal.timeout(5000));
    bus.getState().set('tts_status', 'ok');
    return d;
  } catch (e) {
    bus.getState().patch({ tts_status: 'error', last_error: `Voice jack: ${e instanceof Error ? e.message : String(e)}` });
    return null;
  }
}

export async function probeBrain(): Promise<string[] | null> {
  const s = settings.getState().brain;
  if (s.mode !== 'llm') {
    bus.getState().set('brain_status', 'off');
    return null;
  }
  try {
    const models = await discoverModels(s.baseUrl, AbortSignal.timeout(5000));
    bus.getState().set('brain_status', 'ok');
    return models;
  } catch (e) {
    bus.getState().patch({
      brain_status: 'error',
      last_error: `Brain jack: ${e instanceof Error ? e.message : String(e)} (LM Studio: enable CORS in server settings)`,
    });
    return null;
  }
}
