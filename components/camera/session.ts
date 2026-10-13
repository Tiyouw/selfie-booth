import type { PhotoSlot } from '../../lib/types';

export type SessionPhase = 'setup' | 'countdown' | 'capturing' | 'review' | 'paused' | 'complete';
export type CountdownSeconds = 3 | 5 | 10;

export interface CameraSession {
  phase: SessionPhase;
  slots: PhotoSlot[];
  targets: readonly number[];
  queue: readonly number[];
  cursor: number;
  active: number;
  visibleCount: number;
  seconds: CountdownSeconds;
  remaining: number;
  version: number;
  changed: boolean;
  hasCompleted: boolean;
  capturedIndices: number[];
  resumePhase: 'countdown' | 'review';
  pauseReason: string | null;
}

export type SessionAction =
  | { type: 'start'; seconds: CountdownSeconds }
  | { type: 'tick'; version: number }
  | { type: 'captured'; version: number; src: string }
  | { type: 'pause'; reason?: string }
  | { type: 'resume' }
  | { type: 'retake'; index: number }
  | { type: 'restart' }
  | { type: 'finishReview' }
  | { type: 'keepResults' };

export function createCameraSession(slots: PhotoSlot[], targets: readonly number[], visibleCount: number): CameraSession {
  if (!targets.length || new Set(targets).size !== targets.length || targets.some((index) => !Number.isInteger(index) || index < 0 || index >= visibleCount || !slots[index])) {
    throw new Error('Target sesi kamera tidak valid.');
  }
  const immutableTargets = Object.freeze([...targets]);
  return {
    phase: 'setup',
    slots: slots.map((slot) => ({ ...slot })),
    targets: immutableTargets,
    queue: immutableTargets,
    cursor: 0,
    active: immutableTargets[0],
    visibleCount,
    seconds: 3,
    remaining: 3,
    version: 0,
    changed: false,
    hasCompleted: false,
    capturedIndices: [],
    resumePhase: 'countdown',
    pauseReason: null,
  };
}

/** Every transition invalidates callbacks scheduled by the previous state. */
export function cameraSessionReducer(state: CameraSession, action: SessionAction): CameraSession {
  const next = (patch: Partial<CameraSession>): CameraSession => ({ ...state, ...patch, version: state.version + 1 });
  switch (action.type) {
    case 'start':
      return state.phase === 'setup'
        ? next({ phase: 'countdown', seconds: action.seconds, remaining: action.seconds })
        : state;
    case 'tick':
      if (action.version !== state.version) return state;
      if (state.phase !== 'countdown' && state.phase !== 'review') return state;
      if (state.remaining > 1) return next({ remaining: state.remaining - 1 });
      if (state.phase === 'countdown') return next({ phase: 'capturing', remaining: 0 });
      if (state.cursor === state.queue.length - 1) return next({ phase: 'complete', remaining: 0, hasCompleted: true });
      return next({ phase: 'countdown', cursor: state.cursor + 1, active: state.queue[state.cursor + 1], remaining: state.seconds });
    case 'captured': {
      if (action.version !== state.version || state.phase !== 'capturing' || !action.src) return state;
      const slots = state.slots.map((slot, index) => index === state.active
        ? { ...slot, src: action.src, zoom: 1, ox: 0, oy: 0 }
        : slot);
      return next({ phase: 'review', slots, changed: true, remaining: 3,
        capturedIndices: Array.from(new Set([...state.capturedIndices, state.active])) });
    }
    case 'pause':
      if (state.phase !== 'countdown' && state.phase !== 'capturing' && state.phase !== 'review') return state;
      return next({
        phase: 'paused',
        resumePhase: state.phase === 'review' ? 'review' : 'countdown',
        remaining: state.phase === 'review' ? state.remaining : state.seconds,
        pauseReason: action.reason ?? 'Sesi dijeda. Ambil waktu untuk bersiap.',
      });
    case 'resume':
      return state.phase === 'paused' ? next({ phase: state.resumePhase, pauseReason: null }) : state;
    case 'retake': {
      const isCurrentReview = (state.phase === 'review' || (state.phase === 'paused' && state.resumePhase === 'review')) && action.index === state.active;
      const lateReviewClick = state.phase === 'countdown' && state.cursor > 0 && action.index === state.queue[state.cursor - 1];
      if (!isCurrentReview && !lateReviewClick && state.phase !== 'complete') return state;
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.visibleCount) return state;
      return next({
        phase: 'countdown',
        active: action.index,
        queue: state.phase === 'complete' ? [action.index] : state.queue,
        cursor: state.phase === 'complete' ? 0 : lateReviewClick ? state.cursor - 1 : state.cursor,
        remaining: state.seconds,
        pauseReason: null,
      });
    }
    case 'restart':
      if (state.phase !== 'complete') return state;
      return next({ phase: 'countdown', queue: state.targets, cursor: 0, active: state.targets[0], remaining: state.seconds, pauseReason: null });
    case 'finishReview':
      if ((state.phase === 'review' || (state.phase === 'paused' && state.resumePhase === 'review')) && state.cursor === state.queue.length - 1) {
        return next({ phase: 'complete', remaining: 0, pauseReason: null, hasCompleted: true });
      }
      return state;
    case 'keepResults':
      return state.phase === 'paused' && state.hasCompleted
        ? next({ phase: 'complete', remaining: 0, pauseReason: null })
        : state;
  }
}

export function mergeCapturedSlots(current: PhotoSlot[], captured: PhotoSlot[], indices: readonly number[]): PhotoSlot[] {
  const changed = new Set(indices);
  return current.map((slot, i) => changed.has(i) && captured[i] ? { ...captured[i], id: slot.id } : slot);
}
