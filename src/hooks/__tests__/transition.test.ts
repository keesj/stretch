import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';
import { useWorkout } from '../useWorkout';

describe('Exercise transition flow', () => {
  const mockRoutine = {
    id: 'test-routine',
    title: 'Test Routine',
    description: 'Test',
    stretches: ['stretch1', 'stretch2'],
  };

  const mockStretches = [
    { 
      id: 'stretch1', 
      title: 'Stretch 1', 
      duration: 2, 
      instructions: ['Step 1'], 
      bodyParts: [], 
      difficulty: 'easy' as const, 
      illustration: '🧘' 
    },
    { 
      id: 'stretch2', 
      title: 'Stretch 2', 
      duration: 2, 
      instructions: ['Step 2'], 
      bodyParts: [], 
      difficulty: 'easy' as const, 
      illustration: '🧘' 
    },
  ];

  it('should transition exercises when timer completes', () => {
    let onCompleteCallback: (() => void) | null = null;

    const { result: workoutResult } = renderHook(() => 
      useWorkout({
        routine: mockRoutine,
        stretches: mockStretches,
        onComplete: () => {},
      })
    );

    // First exercise
    expect(workoutResult.current.currentExerciseIndex).toBe(0);
    expect(workoutResult.current.currentExercise.id).toBe('stretch1');

    // Simulate timer completing by calling nextExercise
    act(() => {
      workoutResult.current.nextExercise();
    });

    // Should be on second exercise
    expect(workoutResult.current.currentExerciseIndex).toBe(1);
    expect(workoutResult.current.currentExercise.id).toBe('stretch2');
  });

  it('should show correct exercise after multiple transitions', () => {
    const { result } = renderHook(() => 
      useWorkout({
        routine: mockRoutine,
        stretches: mockStretches,
        onComplete: () => {},
      })
    );

    // Start at exercise 1
    expect(result.current.currentExerciseIndex).toBe(0);

    // Move to exercise 2
    act(() => {
      result.current.nextExercise();
    });
    expect(result.current.currentExerciseIndex).toBe(1);
    expect(result.current.currentExercise.id).toBe('stretch2');

    // Reset back to exercise 1
    act(() => {
      result.current.reset();
    });
    expect(result.current.currentExerciseIndex).toBe(0);
    expect(result.current.currentExercise.id).toBe('stretch1');
  });
});