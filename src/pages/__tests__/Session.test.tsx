import { renderHook, act } from '@testing-library/react';
import { useWorkout } from '../../hooks/useWorkout';

describe('Session exercise transition', () => {
  const mockRoutine = {
    id: 'test-routine',
    title: 'Test Routine',
    description: 'Test',
    stretches: ['stretch1', 'stretch2', 'stretch3'],
  };

  const mockStretches = [
    { 
      id: 'stretch1', 
      title: 'Stretch 1', 
      duration: 5, 
      instructions: ['Step 1'], 
      bodyParts: [], 
      difficulty: 'easy' as const, 
      illustration: '🧘' 
    },
    { 
      id: 'stretch2', 
      title: 'Stretch 2', 
      duration: 5, 
      instructions: ['Step 2'], 
      bodyParts: [], 
      difficulty: 'easy' as const, 
      illustration: '🧘' 
    },
    { 
      id: 'stretch3', 
      title: 'Stretch 3', 
      duration: 5, 
      instructions: ['Step 3'], 
      bodyParts: [], 
      difficulty: 'easy' as const, 
      illustration: '🧘' 
    },
  ];

  it('should track exercise transitions correctly', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => 
      useWorkout({
        routine: mockRoutine,
        stretches: mockStretches,
        onComplete,
      })
    );

    // Initial state
    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.currentExercise.id).toBe('stretch1');
    expect(result.current.isCompleted).toBe(false);

    // Move to next exercise
    act(() => {
      result.current.nextExercise();
    });

    expect(result.current.currentExerciseIndex).toBe(1);
    expect(result.current.currentExercise.id).toBe('stretch2');
    expect(result.current.isCompleted).toBe(false);

    // Move to last exercise
    act(() => {
      result.current.nextExercise();
    });

    expect(result.current.currentExerciseIndex).toBe(2);
    expect(result.current.currentExercise.id).toBe('stretch3');
    expect(result.current.isCompleted).toBe(false);

    // Finish workout
    act(() => {
      result.current.nextExercise();
    });

    expect(result.current.isCompleted).toBe(true);
    expect(onComplete).toHaveBeenCalled();
  });

  it('should reset when starting new workout', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => 
      useWorkout({
        routine: mockRoutine,
        stretches: mockStretches,
        onComplete,
      })
    );

    // Move to second exercise
    act(() => {
      result.current.nextExercise();
    });

    expect(result.current.currentExerciseIndex).toBe(1);

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.currentExercise.id).toBe('stretch1');
  });
});