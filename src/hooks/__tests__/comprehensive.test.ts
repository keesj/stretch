import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';
import { useWorkout } from '../useWorkout';

describe('Comprehensive exercise transition tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
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
      duration: 3, 
      instructions: ['Step 1'], 
      bodyParts: [], 
      difficulty: 'easy' as const, 
      illustration: '🧘' 
    },
    { 
      id: 'stretch2', 
      title: 'Stretch 2', 
      duration: 3, 
      instructions: ['Step 2'], 
      bodyParts: [], 
      difficulty: 'easy' as const, 
      illustration: '🧘' 
    },
    { 
      id: 'stretch3', 
      title: 'Stretch 3', 
      duration: 3, 
      instructions: ['Step 3'], 
      bodyParts: [], 
      difficulty: 'easy' as const, 
      illustration: '🧘' 
    },
  ];

  describe('useTimer', () => {
    it('should countdown from initial time to 0', () => {
      const { result } = renderHook(() => useTimer({ initialTime: 5 }));

      expect(result.current.timeLeft).toBe(5);

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.timeLeft).toBe(2);
      expect(result.current.isRunning).toBe(true);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.timeLeft).toBe(0);
    });

    it('should pause and resume correctly', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => useTimer({ initialTime: 10, onComplete }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.timeLeft).toBe(5);

      act(() => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(true);
      expect(result.current.timeLeft).toBe(5);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Should not decrement while paused
      expect(result.current.timeLeft).toBe(5);

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.timeLeft).toBe(0);
      expect(onComplete).toHaveBeenCalled();
    });

    it('should call onComplete when time reaches 0', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => useTimer({ initialTime: 2, onComplete }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('useWorkout transitions', () => {
    let onCompleteCallback: ((session: any) => void) | null = null;

    beforeEach(() => {
      onCompleteCallback = vi.fn();
    });

    it('should start at first exercise', () => {
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: onCompleteCallback!,
        })
      );

      expect(result.current.currentExerciseIndex).toBe(0);
      expect(result.current.currentExercise.id).toBe('stretch1');
      expect(result.current.totalExercises).toBe(3);
      expect(result.current.isCompleted).toBe(false);
    });

    it('should move to next exercise', () => {
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: onCompleteCallback!,
        })
      );

      expect(result.current.currentExerciseIndex).toBe(0);

      act(() => {
        result.current.nextExercise();
      });

      expect(result.current.currentExerciseIndex).toBe(1);
      expect(result.current.currentExercise.id).toBe('stretch2');
      expect(result.current.isCompleted).toBe(false);
    });

    it('should move through all exercises', () => {
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: onCompleteCallback!,
        })
      );

      // Start at stretch1
      expect(result.current.currentExerciseIndex).toBe(0);

      // Move to stretch2
      act(() => {
        result.current.nextExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(1);
      expect(result.current.currentExercise.id).toBe('stretch2');

      // Move to stretch3
      act(() => {
        result.current.nextExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(2);
      expect(result.current.currentExercise.id).toBe('stretch3');

      // Try to move past last - should finish workout
      act(() => {
        result.current.nextExercise();
      });
      expect(result.current.isCompleted).toBe(true);
      expect(onCompleteCallback).toHaveBeenCalled();
    });

    it('should go back to previous exercise', () => {
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: onCompleteCallback!,
        })
      );

      // Move forward twice
      act(() => {
        result.current.nextExercise();
        result.current.nextExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(2);

      // Move back once
      act(() => {
        result.current.previousExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(1);

      // Move back again
      act(() => {
        result.current.previousExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(0);

      // Try to go before first - should stay at 0
      act(() => {
        result.current.previousExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(0);
    });

    it('should reset to first exercise', () => {
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: onCompleteCallback!,
        })
      );

      // Move through some exercises
      act(() => {
        result.current.nextExercise();
        result.current.nextExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(2);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.currentExerciseIndex).toBe(0);
      expect(result.current.currentExercise.id).toBe('stretch1');
      expect(result.current.isCompleted).toBe(false);
      expect(result.current.isPaused).toBe(false);
    });

    it('should handle pause state', () => {
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: onCompleteCallback!,
        })
      );

      expect(result.current.isPaused).toBe(false);

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

  describe('Integration: Timer + Workout', () => {
    it('should transition when timer completes', () => {
      let workoutNextExercise: (() => void) | null = null;
      
      const { result: workoutResult } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: vi.fn(),
        })
      );

      // Capture nextExercise function
      act(() => {
        workoutNextExercise = workoutResult.current.nextExercise;
      });

      const { result: timerResult } = renderHook(
        () => useTimer({ 
          initialTime: mockStretches[0].duration,
          onComplete: workoutNextExercise || (() => {}),
        }),
        {
          initialProps: { initialTime: mockStretches[0].duration }
        }
      );

      // Start timer
      act(() => {
        timerResult.current.start();
      });

      // Advance timer to 0
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Should now be on stretch2
      expect(workoutResult.current.currentExerciseIndex).toBe(1);
      expect(workoutResult.current.currentExercise.id).toBe('stretch2');
    });

    it('should handle complete workout flow', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete,
        })
      );

      // Simulate completing each exercise
      act(() => {
        result.current.nextExercise(); // stretch1 -> stretch2
      });
      expect(result.current.currentExerciseIndex).toBe(1);

      act(() => {
        result.current.nextExercise(); // stretch2 -> stretch3
      });
      expect(result.current.currentExerciseIndex).toBe(2);

      act(() => {
        result.current.nextExercise(); // stretch3 -> finish
      });
      expect(result.current.isCompleted).toBe(true);
      expect(onComplete).toHaveBeenCalled();
    });
  });
});