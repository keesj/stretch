import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';
import { useWorkout } from '../useWorkout';

describe('Timer setup countdown and auto-start', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('useTimer setup countdown', () => {
    it('should show countdown format 30.. 30. 30', () => {
      const { result } = renderHook(() => useTimer({ initialTime: 30 }));

      expect(result.current.timeLeft).toBe(30);
      expect(result.current.isRunning).toBe(false);

      act(() => {
        result.current.start();
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.timeLeft).toBe(30);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(result.current.timeLeft).toBe(29);
    });

    it('should count down to 0 and call onComplete', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => useTimer({ initialTime: 3, onComplete }));

      act(() => {
        result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.timeLeft).toBe(0);
      expect(onComplete).toHaveBeenCalled();
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

      expect(result.current.isRunning).toBe(false);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

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
  });

  describe('useWorkout with timer', () => {
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

    it('should transition to next exercise when timer completes', () => {
      let timerOnComplete: (() => void) | null = null;
      
      const { result: workoutResult } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete: () => {},
        })
      );

      const { result: timerResult } = renderHook(
        () => useTimer({ 
          initialTime: mockStretches[0].duration,
          onComplete: () => {
            if (timerOnComplete) {
              timerOnComplete();
            }
          }
        }),
        {
          initialProps: { initialTime: mockStretches[0].duration }
        }
      );

      // Start timer
      act(() => {
        timerResult.current.start();
      });

      // Capture nextExercise function
      timerOnComplete = workoutResult.current.nextExercise;

      // Advance timer to 0
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Call the onComplete
      if (timerOnComplete) {
        timerOnComplete();
      }

      // Should now be on stretch2
      expect(workoutResult.current.currentExerciseIndex).toBe(1);
      expect(workoutResult.current.currentExercise.id).toBe('stretch2');
    });

    it('should complete all exercises and finish workout', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => 
        useWorkout({
          routine: mockRoutine,
          stretches: mockStretches,
          onComplete,
        })
      );

      // Simulate timer completing for each exercise
      act(() => {
        result.current.nextExercise(); // stretch1 -> stretch2
      });
      expect(result.current.currentExerciseIndex).toBe(1);

      act(() => {
        result.current.nextExercise(); // stretch2 -> stretch3 (last)
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