import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with the given time and is not running', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    expect(result.current.timeLeft).toBe(60);
    expect(result.current.isRunning).toBe(false);
  });

  it('decrements once per second while running', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.timeLeft).toBe(57);
  });

  it('stops decrementing when paused and resumes on start', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 10 }));

    act(() => {
      result.current.start();
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
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.timeLeft).toBe(0);
  });

  it('calls onComplete exactly once when the timer reaches 0', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useTimer({ initialTime: 5, onComplete }));

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isRunning).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Nothing happens if time advances further
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('completes at the exact wall-clock time, not on a tick boundary', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useTimer({ initialTime: 2, onComplete }));

    act(() => {
      result.current.start();
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.timeLeft).toBe(1);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isRunning).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not restart after completion', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useTimer({ initialTime: 1, onComplete }));

    act(() => {
      result.current.start();
      vi.advanceTimersByTime(1000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.start();
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.timeLeft).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('reset() stops the timer and restores the initial time', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.start();
      vi.advanceTimersByTime(30000);
      result.current.reset();
    });

    expect(result.current.timeLeft).toBe(60);
    expect(result.current.isRunning).toBe(false);
  });

  it('reset(newTime) changes the countdown length', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.reset(120);
    });
    expect(result.current.timeLeft).toBe(120);

    act(() => {
      result.current.start();
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.timeLeft).toBe(117);
  });

  it('skip() stops the timer at 0 without calling onComplete', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useTimer({ initialTime: 60, onComplete }));

    act(() => {
      result.current.start();
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      result.current.skip();
    });

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.isRunning).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.timeLeft).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('start() is a no-op when there is no time left', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 10 }));

    act(() => {
      result.current.skip();
      result.current.start();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.timeLeft).toBe(0);
  });
});
