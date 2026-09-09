import assert from 'node:assert/strict';
import test from 'node:test';
import type { PhotoSlot } from '../../lib/types';
import { cameraSessionReducer as reduce, createCameraSession, mergeCapturedSlots, type CameraSession } from './session';

const originals = (): PhotoSlot[] => Array.from({ length: 4 }, (_, i) => ({ id: `slot-${i}`, src: `old-${i}`, zoom: 1.4 + i / 10, ox: 0.3, oy: -0.5 }));
const tick = (state: CameraSession) => reduce(state, { type: 'tick', version: state.version });
const runCountdown = (state: CameraSession) => {
  while (state.phase === 'countdown') state = tick(state);
  assert.equal(state.phase, 'capturing');
  return state;
};
const shoot = (state: CameraSession, src = `new-${state.active}`) => {
  state = runCountdown(state);
  return reduce(state, { type: 'captured', version: state.version, src });
};
const finishReview = (state: CameraSession) => {
  while (state.phase === 'review') state = tick(state);
  return state;
};
const start = (targets = [0, 1, 2, 3]) => reduce(createCameraSession(originals(), targets, 4), { type: 'start', seconds: 3 });

test('session captures immutable ordered targets and leaves original/untargeted transforms intact', () => {
  const original = originals();
  const targets = [2, 0];
  let state = createCameraSession(original, targets, 4);
  targets.reverse();
  assert.deepEqual(state.targets, [2, 0]);
  assert.notEqual(state.slots[0], original[0]);
  state = reduce(state, { type: 'start', seconds: 3 });
  assert.equal(state.active, 2);
  state = finishReview(shoot(state));
  assert.equal(state.active, 0);
  state = finishReview(shoot(state));
  assert.equal(state.phase, 'complete');
  assert.deepEqual(original, originals());
  for (const index of [1, 3]) assert.deepEqual(state.slots[index], original[index]);
  assert.deepEqual(state.slots[2], { id: 'slot-2', src: 'new-2', zoom: 1, ox: 0, oy: 0 });
});

test('review remains frozen for three ticks before continuing', () => {
  const review = shoot(start());
  assert.equal(review.remaining, 3);
  assert.equal(tick(tick(review)).phase, 'review');
  assert.equal(tick(tick(tick(review))).active, 1);
});

test('retaking a review invalidates its pending next-slot timer', () => {
  const review = shoot(start());
  let state = reduce(review, { type: 'retake', index: 0 });
  state = reduce(state, { type: 'tick', version: review.version });
  assert.equal(state.active, 0);
  assert.equal(state.remaining, 3);
  state = finishReview(shoot(state, 'retaken'));
  assert.equal(state.active, 1);
  assert.equal(state.slots[0].src, 'retaken');
});

test('late timers and duplicate capture effects cannot capture twice', () => {
  const countdown = start();
  const capture = runCountdown(countdown);
  const review = reduce(capture, { type: 'captured', version: capture.version, src: 'one' });
  assert.equal(reduce(review, { type: 'captured', version: capture.version, src: 'two' }), review);
  assert.equal(reduce(review, { type: 'tick', version: countdown.version }), review);
});

test('hidden tab or ended camera pauses countdown and rejects in-flight capture until explicit resume', () => {
  const capture = runCountdown(start([1]));
  let state = reduce(capture, { type: 'pause', reason: 'Kamera terputus' });
  assert.equal(state.phase, 'paused');
  assert.equal(reduce(state, { type: 'captured', version: capture.version, src: 'late' }), state);
  assert.equal(tick(state), state);
  state = reduce(state, { type: 'resume' });
  assert.equal(state.phase, 'countdown');
  assert.equal(state.remaining, 3);
  assert.equal(finishReview(shoot(state)).phase, 'complete');
});

test('pausing frozen review preserves its remaining time and active slot', () => {
  const review = tick(shoot(start()));
  const paused = reduce(review, { type: 'pause' });
  assert.equal(paused.remaining, 2);
  assert.equal(tick(paused), paused);
  const resumed = reduce(paused, { type: 'resume' });
  assert.equal(resumed.phase, 'review');
  assert.equal(resumed.active, 0);
  assert.equal(resumed.remaining, 2);
  assert.equal(finishReview(resumed).active, 1);
});

test('final-review retake of any visible photo returns to final review, never later slots', () => {
  let state = finishReview(shoot(start([0])));
  assert.equal(state.phase, 'complete');
  state = reduce(state, { type: 'retake', index: 2 });
  assert.deepEqual(state.queue, [2]);
  state = finishReview(shoot(state));
  assert.equal(state.phase, 'complete');
  assert.equal(state.slots[3].src, 'old-3');
  state = reduce(state, { type: 'restart' });
  assert.deepEqual(state.queue, [0]);
  assert.equal(state.active, 0);
});

test('retake all returns to original ordered targets without overwriting non-targets', () => {
  let state = start([3, 1]);
  state = finishReview(shoot(state));
  state = finishReview(shoot(state));
  const untouched = state.slots[2];
  state = reduce(state, { type: 'restart' });
  assert.deepEqual(state.queue, [3, 1]);
  assert.equal(state.slots[2], untouched);
  assert.equal(state.phase, 'countdown');
});

test('invalid or duplicate targets fail before opening a session', () => {
  for (const targets of [[], [0, 0], [4], [-1], [0.5]]) {
    assert.throws(() => createCameraSession(originals(), targets, 4));
  }
  assert.throws(() => createCameraSession(originals(), [2], 2));
});

test('a one-photo layout keeps all four persistent slots and their untouched transforms', () => {
  let state = reduce(createCameraSession(originals(), [0], 1), { type: 'start', seconds: 3 });
  state = finishReview(shoot(state));
  assert.equal(state.slots.length, 4);
  assert.deepEqual(state.slots.slice(1), originals().slice(1));
  assert.equal(reduce(state, { type: 'retake', index: 1 }), state);
});

test('retaking while review is paused invalidates both the old timer and resume action', () => {
  const review = shoot(start([1, 3]));
  const paused = reduce(review, { type: 'pause' });
  let state = reduce(paused, { type: 'retake', index: 1 });
  const retake = state;
  state = reduce(state, { type: 'tick', version: review.version });
  state = reduce(state, { type: 'resume' });
  assert.equal(state, retake);
  assert.equal(state.remaining, 3);
  state = finishReview(shoot(state));
  assert.equal(state.active, 3);
});

test('all countdown durations take exactly their configured number of ticks', () => {
  for (const seconds of [3, 5, 10] as const) {
    let state = reduce(createCameraSession(originals(), [0], 4), { type: 'start', seconds });
    for (let remaining = seconds; remaining > 0; remaining--) {
      assert.equal(state.phase, 'countdown');
      assert.equal(state.remaining, remaining);
      state = tick(state);
    }
    assert.equal(state.phase, 'capturing');
  }
});

test('a retake click arriving just after automatic advance returns to the reviewed slot', () => {
  const nextPhoto = finishReview(shoot(start()));
  assert.equal(nextPhoto.active, 1);
  const retake = reduce(nextPhoto, { type: 'retake', index: 0 });
  assert.equal(retake.active, 0);
  assert.equal(retake.remaining, 3);
  assert.equal(reduce(retake, { type: 'tick', version: nextPhoto.version }), retake);
  assert.equal(finishReview(shoot(retake)).active, 1);
});

test('confirmation merges captured indices only, preserving a late hidden upload', () => {
  let state = finishReview(shoot(start([0])));
  state = reduce(state, { type: 'retake', index: 2 });
  state = finishReview(shoot(state));
  const current = originals();
  current[3] = { ...current[3], src: 'late-upload' };
  const merged = mergeCapturedSlots(current, state.slots, state.capturedIndices);
  assert.deepEqual(state.capturedIndices, [0, 2]);
  assert.equal(merged[0].src, 'new-0');
  assert.equal(merged[2].src, 'new-2');
  assert.equal(merged[3].src, 'late-upload');
  assert.equal(merged[1], current[1]);
});

test('final frozen results remain saveable after disconnection, but unfinished sessions cannot finish', () => {
  const final = reduce(shoot(start([0])), { type: 'pause', reason: 'Kamera terputus' });
  const complete = reduce(final, { type: 'finishReview' });
  assert.equal(complete.phase, 'complete');
  assert.equal(complete.slots[0].src, 'new-0');
  const unfinished = shoot(start([0, 1]));
  assert.equal(reduce(unfinished, { type: 'finishReview' }), unfinished);
  const countdown = start([0]);
  assert.equal(reduce(countdown, { type: 'finishReview' }), countdown);
});

for (const action of [{ type: 'retake', index: 0 }, { type: 'restart' }] as const) {
  test(`interrupted ${action.type} can keep completed photos without a camera`, () => {
    const firstShot = finishReview(shoot(start([0, 1])));
    const original = finishReview(shoot(firstShot));
    const capturing = runCountdown(reduce(original, action));
    const paused = reduce(capturing, { type: 'pause', reason: 'Kamera terputus' });
    const recovered = reduce(paused, { type: 'keepResults' });
    assert.equal(recovered.phase, 'complete');
    assert.deepEqual(recovered.slots, original.slots);
    assert.deepEqual(recovered.capturedIndices, original.capturedIndices);
    assert.equal(reduce(recovered, { type: 'captured', version: capturing.version, src: 'late' }), recovered);
    assert.equal(reduce(recovered, { type: 'tick', version: paused.version }), recovered);
  });
}

test('keeping restarted results retains successful replacements and untouched photos', () => {
  let state = finishReview(shoot(finishReview(shoot(start([0, 1])))));
  state = reduce(state, { type: 'restart' });
  state = finishReview(shoot(state, 'replacement-0'));
  state = reduce(state, { type: 'pause' });
  state = reduce(state, { type: 'keepResults' });
  assert.equal(state.phase, 'complete');
  assert.equal(state.slots[0].src, 'replacement-0');
  assert.equal(state.slots[1].src, 'new-1');
  assert.deepEqual(state.slots.slice(2), originals().slice(2));
});

test('unfinished initial sessions cannot skip to existing results, even with original photos', () => {
  const state = reduce(finishReview(shoot(start([0, 1]))), { type: 'pause' });
  assert.equal(state.hasCompleted, false);
  assert.equal(reduce(state, { type: 'keepResults' }), state);
});
