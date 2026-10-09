import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MotionConfig } from 'framer-motion';
import { ExerciseSection } from '../ExerciseSection';
import type { Stretch } from '../../types/stretch';

function makeExercise(overrides: Partial<Stretch> = {}): Stretch {
  return {
    id: 'exercise-1',
    title: 'Upward Salute',
    duration: 60,
    instructions: ['Raise arms', 'Hold'],
    bodyParts: ['arms'],
    difficulty: 'easy',
    illustration: '🤸‍♀️',
    ...overrides,
  };
}

interface Harness {
  onCompleted: ReturnType<typeof vi.fn>;
  onPhaseChange: ReturnType<typeof vi.fn>;
  onAutoStartConsumed: ReturnType<typeof vi.fn>;
  scheduleBeeps: ReturnType<typeof vi.fn>;
  onShowInstructions: ReturnType<typeof vi.fn>;
}

function baseProps(overrides: Partial<Record<string, unknown>> = {}) {
  const harness: Harness = {
    onCompleted: vi.fn(),
    onPhaseChange: vi.fn(),
    onAutoStartConsumed: vi.fn(),
    scheduleBeeps: vi.fn(),
    onShowInstructions: vi.fn(),
  };
  const props = {
    exercise: makeExercise(),
    nextExercise: makeExercise({
      id: 'next-1',
      title: 'Toe Touch',
      duration: 30,
    }),
    index: 0,
    isActive: true,
    isLast: false,
    autoStart: false,
    getClock: () => 0,
    onNext: vi.fn(),
    ...harness,
    ...overrides,
  };
  return { harness, props };
}

function renderSection(overrides: Partial<Record<string, unknown>> = {}) {
  const { harness, props } = baseProps(overrides);
  const utils = render(
    <MotionConfig reducedMotion="always">
      <ExerciseSection {...props} />
    </MotionConfig>
  );
  return { harness, ...utils };
}

/**
 * Deterministic clock: requestAnimationFrame and performance.now are driven
 * by hand so countdowns complete without waiting real time. (Framer-motion's
 * own rAF loops are disabled via MotionConfig reducedMotion="always", so the
 * only rAF user is the countdown.)
 */
function setupClock() {
  let now = 0;
  let rafCb: FrameRequestCallback | null = null;
  let rafId = 0;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
    (cb: FrameRequestCallback) => {
      rafCb = cb;
      return ++rafId;
    }
  );
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {
    rafCb = null;
  });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const getClock = () => now / 1000;
  const advanceClock = (ms: number) => {
    act(() => {
      now += ms;
      let guard = 0;
      while (rafCb && guard++ < 1000) {
        const cb = rafCb;
        rafCb = null;
        cb(now);
      }
    });
  };
  return { getClock, advanceClock };
}

describe('ExerciseSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the exercise with a ready timer', () => {
    setupClock();
    renderSection();
    expect(screen.getByText('Upward Salute')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Instructions')).toBeInTheDocument();
  });

  it('shows an "Up next" card with the next exercise at a glance', () => {
    setupClock();
    const { props } = baseProps();
    render(
      <MotionConfig reducedMotion="always">
        <ExerciseSection {...props} />
      </MotionConfig>
    );
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByText('Toe Touch')).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
    // Tapping the card scrolls to the next exercise
    fireEvent.click(screen.getByRole('button', { name: 'Go to next exercise: Toe Touch' }));
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('tapping the timer runs a 3-2-1 countdown and then starts', () => {
    const { getClock, advanceClock } = setupClock();
    const { harness } = renderSection({ getClock });

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('Get ready…')).toBeInTheDocument();
    expect(harness.scheduleBeeps).toHaveBeenCalledWith([
      { frequency: 800, at: 0, duration: 0.1 },
      { frequency: 800, at: 1, duration: 0.1 },
      { frequency: 800, at: 2, duration: 0.1 },
      { frequency: 1200, at: 3, duration: 0.3 },
    ]);

    advanceClock(3100);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByText('Get ready…')).not.toBeInTheDocument();
    expect(harness.onPhaseChange).toHaveBeenCalledWith(0, 'running');
  });

  it('cancels the countdown when tapped again', () => {
    const { getClock } = setupClock();
    renderSection({ getClock });

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Cancel countdown' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel countdown' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByText('Get ready…')).not.toBeInTheDocument();
  });

  it('pauses when scrolling away and resumes from the paused time', () => {
    const { getClock, advanceClock } = setupClock();
    const { props } = baseProps({ getClock });
    const { rerender } = render(
      <MotionConfig reducedMotion="always">
        <ExerciseSection {...props} />
      </MotionConfig>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    advanceClock(3100);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    rerender(
      <MotionConfig reducedMotion="always">
        <ExerciseSection {...props} isActive={false} />
      </MotionConfig>
    );
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();

    rerender(
      <MotionConfig reducedMotion="always">
        <ExerciseSection {...props} />
      </MotionConfig>
    );
    // Still paused — the user taps to resume, no countdown
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByText('Get ready…')).not.toBeInTheDocument();
  });

  it('completes when the timer runs out', () => {
    const { getClock, advanceClock } = setupClock();
    const { harness } = renderSection({ getClock });

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    advanceClock(3100);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(harness.onCompleted).toHaveBeenCalledWith(0);
    expect(harness.onPhaseChange).toHaveBeenCalledWith(0, 'completed');
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('auto-starts with a 5s transition countdown when told to', () => {
    const { getClock, advanceClock } = setupClock();
    const { harness } = renderSection({ getClock, autoStart: true });

    expect(harness.scheduleBeeps).toHaveBeenCalledWith([
      { frequency: 800, at: 0, duration: 0.1 },
      { frequency: 800, at: 1, duration: 0.1 },
      { frequency: 800, at: 2, duration: 0.1 },
      { frequency: 800, at: 3, duration: 0.1 },
      { frequency: 800, at: 4, duration: 0.1 },
      { frequency: 1200, at: 5, duration: 0.3 },
    ]);
    expect(harness.onAutoStartConsumed).toHaveBeenCalledTimes(1);

    advanceClock(5100);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('shows position hints and the up-next card according to position', () => {
    const { getClock } = setupClock();
    const { props } = baseProps({ getClock });
    const { rerender } = render(
      <MotionConfig reducedMotion="always">
        <ExerciseSection {...props} />
      </MotionConfig>
    );

    // First exercise, not last: up-next card, no swipe-up hint
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.queryByText('swipe up')).not.toBeInTheDocument();

    // A middle exercise: swipe-up hint appears
    rerender(
      <MotionConfig reducedMotion="always">
        <ExerciseSection {...props} index={1} />
      </MotionConfig>
    );
    expect(screen.getByText('swipe up')).toBeInTheDocument();
    expect(screen.getByText('Up next')).toBeInTheDocument();

    // Last exercise: no up-next card
    rerender(
      <MotionConfig reducedMotion="always">
        <ExerciseSection {...props} index={8} isLast nextExercise={undefined} />
      </MotionConfig>
    );
    expect(screen.queryByText('Up next')).not.toBeInTheDocument();
    expect(screen.getByText('swipe up')).toBeInTheDocument();
  });
});
