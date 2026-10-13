export const CAMERA_FRAME_FRESHNESS_MS = 1500;

interface CameraFrameState {
  video: Pick<HTMLVideoElement, 'srcObject' | 'readyState' | 'videoWidth' | 'videoHeight'> | null;
  stream: MediaStream | null;
  ready: boolean;
  lastFrameAt: number;
  now: number;
  hidden: boolean;
}

export function canCaptureCameraFrame({ video, stream, ready, lastFrameAt, now, hidden }: CameraFrameState): boolean {
  const track = stream?.getVideoTracks()[0];
  return !!(
    ready && !hidden && now >= lastFrameAt && now - lastFrameAt < CAMERA_FRAME_FRESHNESS_MS &&
    track?.readyState === 'live' && !track.muted && video && video.srcObject === stream &&
    video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
  );
}
