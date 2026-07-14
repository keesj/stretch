import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with correct default values', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    expect(result.current.timeLeft).toBe(60);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  it('starts the timer when start() is called', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.isPaused).toBe(false);
  });

  it('pauses the timer when pause() is called', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.start();
      result.current.pause();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.isPaused).toBe(true);
  });

  it('resumes the timer when start() is called after pause', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.start();
      result.current.pause();
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.isPaused).toBe(false);
  });

  it('decrements timeLeft when timer is running', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.timeLeft).toBe(59);
  });

  it('resets to initial time when reset() is called', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.start();
      vi.advanceTimersByTime(30000);
      result.current.reset();
    });

    expect(result.current.timeLeft).toBe(60);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  it('resets to new time when reset() is called with argument', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.reset(120);
    });

    expect(result.current.timeLeft).toBe(120);
  });

  it('skips to 0 when skip() is called', () => {
    const { result } = renderHook(() => useTimer({ initialTime: 60 }));

    act(() => {
      result.current.skip();
    });

    expect(result.current.timeLeft).toBe(0);
  });

  it('calls onComplete when timer reaches 0', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useTimer({ initialTime: 5, onComplete }));

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onComplete).toHaveBeenCalled();
  });
});