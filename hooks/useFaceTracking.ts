/**
 * useFaceTracking — MediaPipe Face Landmarker hook for rPPG ROI tracking
 * 
 * Uses MediaPipe's FaceLandmarker to detect facial landmarks in real-time,
 * then computes optimal forehead ROI coordinates for rPPG signal extraction.
 * Falls back to a fixed ROI if face detection fails.
 * 
 * Key landmarks used (MediaPipe FaceMesh 478-point model):
 * - Forehead region: landmarks around #10 (top of forehead), #151 (mid-forehead),
 *   #9 (nose bridge top), #108/#337 (temple edges)
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

/** ROI rectangle in pixel coordinates on the canvas */
export interface FaceROI {
  x: number;      // left edge
  y: number;      // top edge
  width: number;
  height: number;
}

/** Status of face tracking */
export type TrackingStatus = 'loading' | 'ready' | 'tracking' | 'lost' | 'error';

/** Default fallback ROI (original hardcoded values on 100x100 canvas) */
const FALLBACK_ROI: FaceROI = { x: 40, y: 15, width: 20, height: 15 };

/** Forehead landmark indices for MediaPipe FaceMesh (478-point model) */
const FOREHEAD_LANDMARKS = {
  topCenter: 10,       // Top of forehead (hairline center)
  midCenter: 151,      // Mid-forehead
  noseBridge: 9,       // Nose bridge top (lower bound)
  leftTemple: 108,     // Left temple
  rightTemple: 337,    // Right temple
  // Additional forehead points for a more robust ROI
  leftForehead: 67,    // Left mid-forehead
  rightForehead: 297,  // Right mid-forehead
};

interface UseFaceTrackingOptions {
  /** Canvas dimensions for coordinate mapping */
  canvasWidth?: number;
  canvasHeight?: number;
  /** How often to run detection (ms). Lower = more accurate but more CPU */
  detectionIntervalMs?: number;
  /** Margin to shrink the ROI inward (avoids hair/eyebrows), 0-1 */
  roiShrinkFactor?: number;
}

export function useFaceTracking(options: UseFaceTrackingOptions = {}) {
  const {
    canvasWidth = 100,
    canvasHeight = 100,
    detectionIntervalMs = 100,  // ~10 FPS for face detection (separate from rPPG 30fps)
    roiShrinkFactor = 0.15,
  } = options;

  const [status, setStatus] = useState<TrackingStatus>('loading');
  const [roi, setRoi] = useState<FaceROI>(FALLBACK_ROI);
  const [faceDetected, setFaceDetected] = useState(false);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastDetectionRef = useRef<number>(0);
  const lostCountRef = useRef<number>(0);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Initialize MediaPipe FaceLandmarker
  useEffect(() => {
    if (initPromiseRef.current) return; // Already initializing

    initPromiseRef.current = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',  // Use WebGL for performance
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        landmarkerRef.current = landmarker;
        setStatus('ready');
        console.log('[FaceTrack] MediaPipe FaceLandmarker initialized (GPU delegate)');
      } catch (err) {
        console.error('[FaceTrack] Failed to initialize:', err);
        setStatus('error');
        // Fall back gracefully — rPPG still works with fixed ROI
      }
    })();

    return () => {
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  /**
   * Compute forehead ROI from detected landmarks.
   * Maps normalized landmarks (0-1) to canvas pixel coordinates.
   */
  const computeForheadROI = useCallback(
    (result: FaceLandmarkerResult): FaceROI | null => {
      if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

      const landmarks = result.faceLandmarks[0];

      // Extract key forehead points
      const topCenter = landmarks[FOREHEAD_LANDMARKS.topCenter];
      const noseBridge = landmarks[FOREHEAD_LANDMARKS.noseBridge];
      const leftTemple = landmarks[FOREHEAD_LANDMARKS.leftTemple];
      const rightTemple = landmarks[FOREHEAD_LANDMARKS.rightTemple];
      const leftForehead = landmarks[FOREHEAD_LANDMARKS.leftForehead];
      const rightForehead = landmarks[FOREHEAD_LANDMARKS.rightForehead];

      // Compute bounding box of forehead region
      const allX = [leftTemple.x, rightTemple.x, leftForehead.x, rightForehead.x, topCenter.x];
      const allY = [topCenter.y, noseBridge.y, leftForehead.y, rightForehead.y];

      const minX = Math.min(...allX);
      const maxX = Math.max(...allX);
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);

      // Map to canvas coordinates
      let x = minX * canvasWidth;
      let y = minY * canvasHeight;
      let width = (maxX - minX) * canvasWidth;
      let height = (maxY - minY) * canvasHeight;

      // Shrink ROI to avoid hair/eyebrows contamination
      const shrinkX = width * roiShrinkFactor;
      const shrinkY = height * roiShrinkFactor;
      x += shrinkX;
      y += shrinkY;
      width -= shrinkX * 2;
      height -= shrinkY * 2;

      // Focus on upper forehead (top 60%) — cleanest skin, least motion artifact
      height *= 0.6;

      // Clamp to canvas bounds
      x = Math.max(0, Math.round(x));
      y = Math.max(0, Math.round(y));
      width = Math.min(canvasWidth - x, Math.max(4, Math.round(width)));
      height = Math.min(canvasHeight - y, Math.max(4, Math.round(height)));

      return { x, y, width, height };
    },
    [canvasWidth, canvasHeight, roiShrinkFactor]
  );

  /**
   * Process a video frame for face detection.
   * Call this from the rPPG processing loop — it rate-limits internally.
   * Returns the current ROI (tracked or fallback).
   */
  const detectFace = useCallback(
    (video: HTMLVideoElement): FaceROI => {
      const now = performance.now();

      // Rate-limit face detection to save CPU
      if (now - lastDetectionRef.current < detectionIntervalMs) {
        return roi;
      }
      lastDetectionRef.current = now;

      // If landmarker isn't ready, return current ROI (fallback on first frames)
      if (!landmarkerRef.current || video.readyState < 2) {
        return roi;
      }

      try {
        const result = landmarkerRef.current.detectForVideo(video, now);
        const newROI = computeForheadROI(result);

        if (newROI) {
          lostCountRef.current = 0;
          setFaceDetected(true);
          setStatus('tracking');
          setRoi(newROI);
          return newROI;
        } else {
          lostCountRef.current++;
          // Tolerate a few missed frames before declaring "lost"
          if (lostCountRef.current > 10) {
            setFaceDetected(false);
            setStatus('lost');
            setRoi(FALLBACK_ROI);
            return FALLBACK_ROI;
          }
          return roi; // Keep last known good ROI
        }
      } catch (err) {
        // Don't crash rPPG on face detection error
        console.warn('[FaceTrack] Detection error:', err);
        return roi;
      }
    },
    [roi, detectionIntervalMs, computeForheadROI]
  );

  return {
    /** Current ROI for rPPG signal extraction */
    roi,
    /** Whether a face is currently detected */
    faceDetected,
    /** Tracking status */
    status,
    /** Call per video frame to update face tracking */
    detectFace,
    /** Whether the tracker is using the fixed fallback ROI */
    isFallback: status !== 'tracking',
  };
}
