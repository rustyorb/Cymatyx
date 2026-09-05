import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { roiRects, meanRgb, type Rect } from './roi';
import type { RoiName, RoiSample } from '../engine/types';

const W = 160;
const H = 120;
// Pinned to the installed @mediapipe/tasks-vision version (JS and WASM must match).
export const TASKS_VISION_VERSION = '0.10.35';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type CamStatus = 'loading' | 'ready' | 'tracking' | 'lost';

export interface CameraHandle {
  stop(): void;
  readonly video: HTMLVideoElement;
  readonly rects: Record<RoiName, Rect> | null;
  readonly label: string;
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
function loadLandmarker() {
  landmarkerPromise ??= FilesetResolver.forVisionTasks(WASM)
    .then((fileset) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      }),
    )
    .catch((e: unknown) => {
      landmarkerPromise = null; // one offline START must not poison every later START
      throw e;
    });
  return landmarkerPromise;
}

/**
 * Owns getUserMedia + the frame loop. Emits one RoiSample per video frame — but ONLY while a face is
 * tracked. No face → status 'lost' and no samples: a reading the tracker cannot vouch for is not taken.
 */
export async function startCamera(
  deviceId: string | null,
  onSample: (s: RoiSample) => void,
  onStatus: (s: CamStatus) => void,
  onError?: (e: Error) => void,
): Promise<CameraHandle> {
  onStatus('loading');
  const landmarker = await loadLandmarker();
  const video: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = 'user';
  const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
  };
  let el: HTMLVideoElement;
  let ctx: CanvasRenderingContext2D;
  try {
    el = document.createElement('video');
    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    await el.play();
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  } catch (e) {
    release(); // never leave a camera running behind a failed start
    throw e;
  }
  onStatus('ready');

  let rects: Record<RoiName, Rect> | null = null;
  let raf = 0;
  let stopped = false;
  let lastVideoTime = -1;
  const tick = () => {
    if (stopped) return;
    try {
      if (el.readyState >= 2 && el.currentTime !== lastVideoTime) {
        lastVideoTime = el.currentTime;
        ctx.drawImage(el, 0, 0, W, H);
        const lm = landmarker.detectForVideo(el, performance.now()).faceLandmarks[0];
        if (lm) {
          rects = roiRects(lm, W, H);
          const r = rects;
          const sample = (name: RoiName) => meanRgb(ctx.getImageData(r[name].x, r[name].y, r[name].w, r[name].h).data);
          onStatus('tracking');
          onSample({ t: performance.now(), rois: { forehead: sample('forehead'), cheekL: sample('cheekL'), cheekR: sample('cheekR') } });
        } else {
          rects = null;
          onStatus('lost');
        }
      }
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (!stopped) raf = requestAnimationFrame(tick);
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      release();
      el.srcObject = null;
    },
    video: el,
    get rects() {
      return rects;
    },
    label: stream.getVideoTracks()[0]?.label ?? 'camera',
  };
}
