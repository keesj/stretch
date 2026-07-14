import { renderHook, act } from '@testing-library/react';
import { useWorkout } from '../useWorkout';

describe('useWorkout', () => {
  const mockRoutine = {
    id: 'test-routine',
    title: 'Test Routine',
    stretches: ['stretch1', 'stretch2', 'stretch3'],
  };

  const mockStretches = [
    { id: 'stretch1', title: 'Stretch 1', duration: 30, instructions: [], bodyParts: [], difficulty: 'easy', illustration: '🧘' },
    { id: 'stretch2', title: 'Stretch 2', duration: 30, instructions: [], bodyParts: [], difficulty: 'easy', illustration: '🧘' },
    { id: 'stretch3', title: 'Stretch 3', duration: 30, instructions: [], bodyParts: [], difficulty: 'easy', illustration: '🧘' },
  ];

  it('initializes with correct values', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete,
    }));

    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.currentExercise.id).toBe('stretch1');
    expect(result.current.totalExercises).toBe(3);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  it('moves to next exercise', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete,
    }));

    act(() => {
      result.current.nextExercise();
    });

    expect(result.current.currentExerciseIndex).toBe(1);
    expect(result.current.currentExercise.id).toBe('stretch2');
  });

  it('moves to previous exercise', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete,
    }));

    act(() => {
      result.current.nextExercise();
      result.current.previousExercise();
    });

    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.currentExercise.id).toBe('stretch1');
  });

  it('finishes workout when reaching last exercise', () => {
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
    expect(result.current.currentExercise.id).toBe('stretch3');
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      result.current.nextExercise();
    });

    expect(result.current.isCompleted).toBe(true);
    expect(onComplete).toHaveBeenCalled();
  });

  it('resets workout state', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete,
    }));

    act(() => {
      result.current.nextExercise();
      result.current.togglePause();
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  it('toggles pause state', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useWorkout({
      routine: mockRoutine,
      stretches: mockStretches,
      onComplete,
    }));

    act(() => {
      result.current.togglePause();
    });

    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.togglePause();
    });

    expect(result.current.isPaused).toBe(false);
  });
});