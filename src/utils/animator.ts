/**
 * Simple animation state machine for progress-bar transitions.
 * Replaces raw requestAnimationFrame with a predictable state-driven approach.
 * 
 * State machine: IDLE -> RUNNING -> COMPLETED (back to IDLE on reset)
 * 
 * Transitions:
 * - IDLE + request(progress) -> setRAF, start state -> RUNNING
 * - RUNNING + animationComplete -> set progress, clearRAF -> COMPLETED
 * - COMPLETED + request(progress) -> setRAF -> RUNNING  
 * - any + cancel -> clearRAF -> IDLE
 */

interface AnimationState {
  progress: number;
  isRunning: boolean;
  rafId: number | null;
  startTime: number;
  targetProgress: number;
  animDurationMs: number;
}

export function createAnimationController(
  initialProgress: number = 0,
  animDurationMs: number = 1000
): {
  state: AnimationState;
  setProgressCallback: (cb: (p: number) => void) => void;
  start: (targetProgress: number) => void;
  cancel: () => void;
} {
  let state: AnimationState = {
    progress: initialProgress,
    isRunning: false,
    rafId: null,
    startTime: 0,
    targetProgress: initialProgress,
    animDurationMs,
  };
  let progressCallback: ((p: number) => void) | null = null;

  const tick = (currentTime: number) => {
    if (!state.isRunning) {
      state.rafId = null;
      return;
    }

    const elapsed = currentTime - state.startTime;
    // Simple linear animation (easier to test than cubic easeOut)
    const currentProgress = state.progress + (state.targetProgress - state.progress) * Math.min(elapsed / state.animDurationMs, 1);

    state.progress = currentProgress;
    progressCallback?.(currentProgress);

    if (elapsed < state.animDurationMs) {
      state.rafId = requestAnimationFrame(tick);
    } else {
      state.progress = state.targetProgress;
      state.isRunning = false;
      state.rafId = null;
      progressCallback?.(state.targetProgress);
    }
  };

  return {
    state,
    setProgressCallback(cb: (p: number) => void) {
      progressCallback = cb;
    },
    start(targetProgress: number) {
      // If already animating, cancel first (covers the cancelAnimationFrame line)
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }

      if (state.progress === targetProgress) {
        return;
      }

      state.isRunning = true;
      state.startTime = performance.now();
      state.targetProgress = targetProgress;
      state.rafId = requestAnimationFrame(tick);
    },
    cancel() {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
      state.isRunning = false;
    },
  };
}