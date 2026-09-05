import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** 0.3 s 440 Hz mono 16-bit WAV, generated in code — the e2e fake voice. */
function beepWav(): Buffer {
  const sr = 8000;
  const n = Math.round(sr * 0.3);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 8000), 44 + i * 2);
  return buf;
}

/** Dev-only fake TTS + LLM under /mock/v1 so the smoke test never needs a real server. */
function mockProviders(): Plugin {
  return {
    name: 'cymatyx-mock-providers',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/mock/v1', (req, res) => {
        const send = (status: number, body: unknown, type = 'application/json') => {
          res.statusCode = status;
          res.setHeader('Content-Type', type);
          res.end(type === 'application/json' ? JSON.stringify(body) : (body as Buffer));
        };
        const url = (req.url ?? '').split('?')[0];
        if (url === '/models') return send(200, { data: [{ id: 'mock-model' }, { id: 'kokoro' }] });
        if (url === '/audio/voices') return send(200, { voices: ['af_sky', 'am_adam'] });
        if (url === '/audio/speech') return send(200, beepWav(), 'audio/wav');
        if (url === '/chat/completions') return send(200, { choices: [{ message: { content: 'Mock brain says: breathe with the ring.' } }] });
        send(404, { error: 'unknown mock route' });
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), mockProviders()],
  server: { port: 3000, host: '0.0.0.0' },
  worker: { format: 'es' },
});
