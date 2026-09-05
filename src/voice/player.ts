export interface Player {
  play(blob: Blob): Promise<void>;
  stop(): void;
  readonly playing: boolean;
}

/** One <audio> at a time. play() resolves when playback ends or is stopped; rejects if the element errors. */
export function createPlayer(): Player {
  let el: HTMLAudioElement | null = null;
  let url: string | null = null;
  let finish: (() => void) | null = null;
  const cleanup = () => {
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    if (url) URL.revokeObjectURL(url);
    el = null;
    url = null;
    const f = finish;
    finish = null;
    f?.();
  };
  return {
    get playing() {
      return el !== null;
    },
    async play(blob) {
      cleanup();
      const a = new Audio();
      url = URL.createObjectURL(blob);
      a.src = url;
      el = a;
      await new Promise<void>((resolve, reject) => {
        finish = resolve;
        a.onended = () => cleanup();
        a.onerror = () => {
          cleanup();
          reject(new Error('audio playback failed'));
        };
        a.play().catch((e) => {
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        });
      });
    },
    stop: cleanup,
  };
}
