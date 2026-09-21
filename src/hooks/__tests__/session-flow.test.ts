import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';
import { useWorkout } from '../useWorkout';

/**
 * Integration tests that wire the real useTimer and useWorkout together,
 * mirroring how Session.tsx composes them: the timer's onComplete advances
 * the workout, and the timer is reset + restarted for each exercise.
 */
describe('timer + workout integration (real hooks)', () => {
  const mockRoutine = {
    id: 'test-routine',
    title: 'Test Routine',
    description: 'Test',
    stretches: ['stretch1', 'stretch2', 'stretch3'],
  };

  const mockStretches = [
    { id: 'stretch1', title: 'Stretch 1', duration: 3, instructions: ['Step 1'], bodyParts: [], difficulty: 'easy' as const, illustration: '🧘' },
    { id: 'stretch2', title: 'Stretch 2', duration: 3, instructions: ['Step 2'], bodyParts: [], difficulty: 'easy' as const, illustration: '🧘' },
    { id: 'stretch3', title: 'Stretch 3', duration: 3, instructions: ['Step 3'], bodyParts: [], difficulty: 'easy' as const, illustration: '🧘' },
  ];

  function renderSession() {
    const onComplete = vi.fn();
    const workout = renderHook(() =>
      useWorkout({
        routine: mockRoutine,
        stretches: mockStretches,
        onComplete,
      })
    );
    const timer = renderHook(() =>
      useTimer({
        initialTime: mockStretches[workout.result.current.currentExerciseIndex].duration,
        onComplete: () => workout.result.current.nextExercise(),
      })
    );
    return { workout, timer, onComplete };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances to the next exercise when the timer completes', () => {
    const { workout, timer } = renderSession();

    expect(workout.result.current.currentExerciseIndex).toBe(0);

    act(() => {
      timer.result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(workout.result.current.currentExerciseIndex).toBe(1);
    expect(workout.result.current.currentExercise.id).toBe('stretch2');
    expect(timer.result.current.timeLeft).toBe(0);
  });

  it('completes the whole workout and reports the session', () => {
    const { workout, timer, onComplete } = renderSession();

    act(() => {
      timer.result.current.start();
    });

    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      if (workout.result.current.isCompleted) {
        break;
      }
      // Mirror Session.tsx: reset the timer for the next exercise
      act(() => {
        timer.result.current.reset(3);
        timer.result.current.start();
      });
    }

    expect(workout.result.current.isCompleted).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);

    const session = onComplete.mock.calls[0][0];
    expect(session).toMatchObject({
      id: 'test-uuid-12345',
      routineId: 'test-routine',
      routineTitle: 'Test Routine',
      duration: expect.any(Number),
      completedAt: expect.any(String),
    });
  });

  it('pausing the timer does not advance the workout', () => {
    const { workout, timer } = renderSession();

    act(() => {
      timer.result.current.start();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      timer.result.current.pause();
      vi.advanceTimersByTime(10000);
    });

    expect(timer.result.current.timeLeft).toBe(2);
    expect(workout.result.current.currentExerciseIndex).toBe(0);
  });

  it('skipping an exercise moves on without completing the workout', () => {
    const { workout, timer, onComplete } = renderSession();

    act(() => {
      timer.result.current.start();
      vi.advanceTimersByTime(1000);
    });

    // Mirror Session.tsx goToNext: skip the timer, then advance
    act(() => {
      timer.result.current.skip();
      workout.result.current.nextExercise();
    });

    expect(timer.result.current.timeLeft).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
    expect(workout.result.current.currentExerciseIndex).toBe(1);
  });
});
