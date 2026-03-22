// Type declarations for @mediapipe/tasks-vision
// The package bundles types in vision.d.ts but lacks proper "exports" in package.json
// for bundler module resolution. This re-exports the key types we need.

declare module '@mediapipe/tasks-vision' {
  export interface FaceLandmarkerOptions {
    baseOptions?: {
      modelAssetPath?: string;
      delegate?: 'CPU' | 'GPU';
    };
    runningMode?: 'IMAGE' | 'VIDEO';
    numFaces?: number;
    minFaceDetectionConfidence?: number;
    minFacePresenceConfidence?: number;
    minTrackingConfidence?: number;
    outputFaceBlendshapes?: boolean;
    outputFacialTransformationMatrixes?: boolean;
  }

  export interface NormalizedLandmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }

  export interface FaceLandmarkerResult {
    faceLandmarks: NormalizedLandmark[][];
    faceBlendshapes?: any[];
    facialTransformationMatrixes?: any[];
  }

  export class FaceLandmarker {
    static createFromOptions(vision: any, options: FaceLandmarkerOptions): Promise<FaceLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult;
    detect(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): FaceLandmarkerResult;
    close(): void;
  }

  export class FilesetResolver {
    static forVisionTasks(wasmFilePath: string): Promise<any>;
  }
}
