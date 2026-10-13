import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMERA_FRAME_FRESHNESS_MS, canCaptureCameraFrame } from './readiness';

function frameState() {
  const track = { readyState: 'live', muted: false };
  const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
  return {
    video: { srcObject: stream, readyState: 2, videoWidth: 1280, videoHeight: 720 },
    stream,
    ready: true,
    lastFrameAt: 100,
    now: 200,
    hidden: false,
  };
}

test('capture requires a recent actual frame from the currently attached stream', () => {
  const state = frameState();
  assert.equal(canCaptureCameraFrame(state), true);
  assert.equal(canCaptureCameraFrame({ ...state, ready: false }), false);
  assert.equal(canCaptureCameraFrame({ ...state, video: null }), false);
  assert.equal(canCaptureCameraFrame({ ...state, stream: null }), false);
  assert.equal(canCaptureCameraFrame({ ...state, stream: frameState().stream }), false);
  assert.equal(canCaptureCameraFrame({ ...state, now: state.lastFrameAt + CAMERA_FRAME_FRESHNESS_MS }), false);
  assert.equal(canCaptureCameraFrame({ ...state, now: state.lastFrameAt - 1 }), false);
});

test('hidden, muted, ended, and missing camera tracks never permit capture', () => {
  const state = frameState();
  assert.equal(canCaptureCameraFrame({ ...state, hidden: true }), false);
  for (const tracks of [[], [{ readyState: 'ended', muted: false }], [{ readyState: 'live', muted: true }]]) {
    const stream = { getVideoTracks: () => tracks } as unknown as MediaStream;
    assert.equal(canCaptureCameraFrame({ ...state, stream, video: { ...state.video, srcObject: stream } }), false);
  }
});

test('metadata and old video dimensions alone do not establish camera readiness', () => {
  const state = frameState();
  for (const patch of [{ readyState: 1 }, { videoWidth: 0 }, { videoHeight: 0 }, { srcObject: null }]) {
    assert.equal(canCaptureCameraFrame({ ...state, video: { ...state.video, ...patch } }), false);
  }
});
