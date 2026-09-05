import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { roiRects, meanRgb, type Rect } from './roi';
import type { RoiName, RoiSample } from '../engine/types';

const W = 160;
const H = 120;
// Pinned to the installed @mediapipe/tasks-vision version (JS and WASM must match).
export const TASKS_VISION_VERSION = '0.10.35';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Face-shaped fallback so sampling continues (flagged 'lost') while the tracker re-acquires.
const FALLBACK: Record<RoiName, Rect> = {
  forehead: { x: 60, y: 20, w: 40, h: 25 },
  cheekL: { x: 40, y: 60, w: 24, h: 18 },
  cheekR: { x: 96, y: 60, w: 24, h: 18 },
};

export type CamStatus = 'loading' | 'ready' | 'tracking' | 'lost';

export interface CameraHandle {
  stop(): void;
  readonly video: HTMLVideoElement;
  readonly rects: Record<RoiName, Rect>;
  readonly label: string;
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
function loadLandmarker() {
  landmarkerPromise ??= FilesetResolver.forVisionTasks(WASM).then((fileset) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    }),
  );
  return landmarkerPromise;
}

/** Owns getUserMedia + the frame loop. Emits one RoiSample per video frame. */
export async function startCamera(
  deviceId: string | null,
  onSample: (s: RoiSample) => void,
  onStatus: (s: CamStatus) => void,
): Promise<CameraHandle> {
  onStatus('loading');
  const landmarker = await loadLandmarker();
  const video: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = 'user';
  const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  const el = document.createElement('video');
  el.srcObject = stream;
  el.muted = true;
  el.playsInline = true;
  await el.play();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  onStatus('ready');

  let rects = FALLBACK;
  let raf = 0;
  let lastVideoTime = -1;
  const tick = () => {
    if (el.readyState >= 2 && el.currentTime !== lastVideoTime) {
      lastVideoTime = el.currentTime;
      ctx.drawImage(el, 0, 0, W, H);
      const res = landmarker.detectForVideo(el, performance.now());
      const lm = res.faceLandmarks[0];
      if (lm) rects = roiRects(lm, W, H);
      onStatus(lm ? 'tracking' : 'lost');
      const sample = (name: RoiName) => {
        const r = rects[name];
        return meanRgb(ctx.getImageData(r.x, r.y, r.w, r.h).data);
      };
      onSample({ t: performance.now(), rois: { forehead: sample('forehead'), cheekL: sample('cheekL'), cheekR: sample('cheekR') } });
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      el.srcObject = null;
    },
    video: el,
    get rects() {
      return rects;
    },
    label: stream.getVideoTracks()[0]?.label ?? 'camera',
  };
}
