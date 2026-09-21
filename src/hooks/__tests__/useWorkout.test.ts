import { renderHook, act } from '@testing-library/react';
import { useWorkout } from '../useWorkout';

describe('useWorkout', () => {
  const mockRoutine = {
    id: 'test-routine',
    title: 'Test Routine',
    description: 'Test',
    stretches: ['stretch1', 'stretch2', 'stretch3'],
  };

  const mockStretches = [
    { id: 'stretch1', title: 'Stretch 1', duration: 30, instructions: [], bodyParts: [], difficulty: 'easy', illustration: '🧘' },
    { id: 'stretch2', title: 'Stretch 2', duration: 30, instructions: [], bodyParts: [], difficulty: 'easy', illustration: '🧘' },
    { id: 'stretch3', title: 'Stretch 3', duration: 30, instructions: [], bodyParts: [], difficulty: 'easy', illustration: '🧘' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with correct values', () => {
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete: vi.fn(),
    }));

    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.currentExercise.id).toBe('stretch1');
    expect(result.current.totalExercises).toBe(3);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  it('moves to next exercise', () => {
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete: vi.fn(),
    }));

    act(() => {
      result.current.nextExercise();
    });

    expect(result.current.currentExerciseIndex).toBe(1);
    expect(result.current.currentExercise.id).toBe('stretch2');
  });

  it('moves to previous exercise and stays at the first one', () => {
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete: vi.fn(),
    }));

    act(() => {
      result.current.nextExercise();
      result.current.nextExercise();
    });
    expect(result.current.currentExerciseIndex).toBe(2);

    act(() => {
      result.current.previousExercise();
    });
    expect(result.current.currentExerciseIndex).toBe(1);

    act(() => {
      result.current.previousExercise();
      result.current.previousExercise();
    });
    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.currentExercise.id).toBe('stretch1');
  });

  it('finishes the workout when leaving the last exercise', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete,
    }));

    act(() => {
      result.current.nextExercise();
      result.current.nextExercise();
    });
    expect(result.current.currentExerciseIndex).toBe(2);
    expect(result.current.isCompleted).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      result.current.nextExercise();
    });
    expect(result.current.isCompleted).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('persists a completed session to localStorage', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete,
    }));

    act(() => {
      vi.advanceTimersByTime(9000);
    });

    act(() => {
      result.current.nextExercise();
      result.current.nextExercise();
      result.current.nextExercise();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);

    const setItem = localStorage.setItem as ReturnType<typeof vi.fn>;
    const calls = setItem.mock.calls.filter(([key]) => key === 'completedSessions');
    expect(calls).toHaveLength(1);

    const saved = JSON.parse(calls[0][1]);
    expect(saved).toEqual([{
      id: 'test-uuid-12345',
      routineId: 'test-routine',
      routineTitle: 'Test Routine',
      duration: 9,
      completedAt: expect.any(String),
    }]);
  });

  it('does not finish twice when nextExercise is called after completion', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete,
    }));

    act(() => {
      result.current.nextExercise();
      result.current.nextExercise();
      result.current.nextExercise();
    });
    expect(result.current.isCompleted).toBe(true);

    act(() => {
      result.current.nextExercise();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const setItem = localStorage.setItem as ReturnType<typeof vi.fn>;
    expect(setItem.mock.calls.filter(([key]) => key === 'completedSessions')).toHaveLength(1);
  });

  it('tracks elapsed seconds while active, pauses when paused, resets on reset', () => {
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete: vi.fn(),
    }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsedSeconds).toBe(5);

    act(() => {
      result.current.togglePause();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsedSeconds).toBe(5);

    act(() => {
      result.current.togglePause();
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedSeconds).toBe(7);

    act(() => {
      result.current.nextExercise();
    });

    act(() => {
      result.current.reset();
    });
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.currentExercise.id).toBe('stretch1');
  });
});
