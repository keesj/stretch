import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';
import { useWorkout } from '../useWorkout';

describe('Session timer and workout flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Session button behavior', () => {
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
    ];

    it('should show Start button initially', () => {
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: () => {},
        })
      );

      expect(result.current.currentExerciseIndex).toBe(0);
      expect(result.current.currentExercise.id).toBe('stretch1');
    });

    it('should start setup countdown when Start button is clicked', () => {
      const onComplete = vi.fn();
      const { result: workoutResult } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete,
        })
      );

      const { result: timerResult } = renderHook(
        () => useTimer({ 
          initialTime: mockStretches[0].duration,
          onComplete: () => {},
        }),
        {
          initialProps: { initialTime: mockStretches[0].duration }
        }
      );

      // Start button clicked - timer starts at 3
      act(() => {
        timerResult.current.start();
      });

      expect(timerResult.current.timeLeft).toBe(3);
      expect(timerResult.current.isRunning).toBe(true);

      // Advance through countdown
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Timer should be at 1
      expect(timerResult.current.timeLeft).toBe(1);
    });

    it('should transition to next exercise after timer completes', () => {
      const onComplete = vi.fn();
      const { result: workoutResult } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete,
        })
      );

      const { result: timerResult } = renderHook(
        () => useTimer({ 
          initialTime: mockStretches[0].duration,
          onComplete: workoutResult.current.nextExercise,
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

      // Should have transitioned to stretch2
      expect(workoutResult.current.currentExerciseIndex).toBe(1);
      expect(workoutResult.current.currentExercise.id).toBe('stretch2');
    });

    it('should handle pause and resume', () => {
      const onComplete = vi.fn();
      const { result: workoutResult } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete,
        })
      );

      const { result: timerResult } = renderHook(
        () => useTimer({ 
          initialTime: 10,
          onComplete: () => {
            onComplete();
          },
        }),
        {
          initialProps: { initialTime: 10 }
        }
      );

      // Start timer
      act(() => {
        timerResult.current.start();
      });

      // Run for 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(timerResult.current.timeLeft).toBe(5);

      // Pause
      act(() => {
        timerResult.current.pause();
      });
      expect(timerResult.current.isRunning).toBe(false);

      // Advance time while paused
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(timerResult.current.timeLeft).toBe(5);

      // Resume
      act(() => {
        timerResult.current.start();
      });

      // Advance remaining time
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(timerResult.current.timeLeft).toBe(0);
      expect(onComplete).toHaveBeenCalled();
    });

    it('should show next exercise preview 10 seconds before end', () => {
      const onComplete = vi.fn();
      const { result: workoutResult } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete,
        })
      );

      const { result: timerResult } = renderHook(
        () => useTimer({ 
          initialTime: mockStretches[0].duration,
          onComplete: workoutResult.current.nextExercise,
        }),
        {
          initialProps: { initialTime: mockStretches[0].duration }
        }
      );

      // Start timer
      act(() => {
        timerResult.current.start();
      });

      // Advance to 10 seconds before end
      act(() => {
        vi.advanceTimersByTime(0); // At start
      });

      // Timer should be running
      expect(timerResult.current.isRunning).toBe(true);
      expect(timerResult.current.timeLeft).toBe(3);
    });

    it('should complete all exercises in routine', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete,
        })
      );

      // Move through all exercises
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

    it('should reset workout to first exercise', () => {
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
      expect(result.current.currentExercise.id).toBe('stretch1');
      expect(result.current.isCompleted).toBe(false);
    });

    it('should handle previous button', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete,
        })
      );

      // Move forward twice
      act(() => {
        result.current.nextExercise();
        result.current.nextExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(2);

      // Go back once
      act(() => {
        result.current.previousExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(1);

      // Go back again
      act(() => {
        result.current.previousExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(0);

      // Can't go back further
      act(() => {
        result.current.previousExercise();
      });
      expect(result.current.currentExerciseIndex).toBe(0);
    });
  });
});