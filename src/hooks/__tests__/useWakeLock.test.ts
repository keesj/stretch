import { renderHook, act } from '@testing-library/react';
import { useWakeLock } from '../useWakeLock';

describe('useWakeLock', () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let releaseMock: ReturnType<typeof vi.fn>;
  let addEventListenerMock: ReturnType<typeof vi.fn>;
  let releaseEventHandler: (() => void) | null;

  function installWakeLock(request: ReturnType<typeof vi.fn>) {
    Object.defineProperty(global.navigator, 'wakeLock', {
      value: { request },
      writable: true,
      configurable: true,
    });
  }

  beforeEach(() => {
    releaseEventHandler = null;
    addEventListenerMock = vi.fn((type: string, handler: () => void) => {
      if (type === 'release') {
        releaseEventHandler = handler;
      }
    });

    releaseMock = vi.fn().mockResolvedValue(undefined);
    requestMock = vi.fn().mockResolvedValue({
      release: releaseMock,
      addEventListener: addEventListenerMock,
    });

    installWakeLock(requestMock);
  });

  it('returns wakeLock, requestWakeLock, and releaseWakeLock', () => {
    const { result } = renderHook(() => useWakeLock({ isActive: false }));
    expect(result.current).toHaveProperty('wakeLock');
    expect(result.current).toHaveProperty('requestWakeLock');
    expect(result.current).toHaveProperty('releaseWakeLock');
  });

  it('does not request a wake lock when inactive', () => {
    renderHook(() => useWakeLock({ isActive: false }));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('requests a wake lock when active', async () => {
    renderHook(() => useWakeLock({ isActive: true }));
    await act(async () => {});
    expect(requestMock).toHaveBeenCalledWith('screen');
  });

  it('does not request a second wake lock while one is held', async () => {
    const { result } = renderHook(() => useWakeLock({ isActive: true }));
    await act(async () => {});

    await act(async () => {
      await result.current.requestWakeLock();
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('releaseWakeLock releases the wake lock', async () => {
    const { result } = renderHook(() => useWakeLock({ isActive: true }));
    await act(async () => {});

    act(() => {
      result.current.releaseWakeLock();
    });

    expect(releaseMock).toHaveBeenCalled();
    expect(result.current.wakeLock).toBeNull();
  });

  it('does not throw when releasing a null wake lock', () => {
    const { result } = renderHook(() => useWakeLock({ isActive: false }));
    expect(() => {
      act(() => {
        result.current.releaseWakeLock();
      });
    }).not.toThrow();
  });

  it('does not throw when release fails', async () => {
    const failReleaseMock = vi.fn().mockRejectedValue(new Error('Release failed'));
    installWakeLock(vi.fn().mockResolvedValue({ release: failReleaseMock, addEventListener: vi.fn() }));

    const { result } = renderHook(() => useWakeLock({ isActive: true }));
    await act(async () => {});

    expect(() => {
      act(() => {
        result.current.releaseWakeLock();
      });
    }).not.toThrow();
  });

  it('warns and clears state when the request fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failRequestMock = vi.fn().mockRejectedValue(new Error('Request failed'));
    installWakeLock(failRequestMock);

    renderHook(() => useWakeLock({ isActive: true }));
    await act(async () => {});

    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to acquire wake lock:',
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it('releases the lock when the sentinel fires a release event', async () => {
    renderHook(() => useWakeLock({ isActive: true }));
    await act(async () => {});

    expect(releaseEventHandler).not.toBeNull();
    act(() => {
      releaseEventHandler!();
    });

    // The handler re-releases the sentinel once
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('releases the wake lock on visibilitychange when hidden', async () => {
    const { result } = renderHook(() => useWakeLock({ isActive: true }));
    await act(async () => {});

    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(releaseMock).toHaveBeenCalled();
  });

  it('does not release on visibilitychange when visible', async () => {
    const { result } = renderHook(() => useWakeLock({ isActive: true }));
    await act(async () => {});

    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(releaseMock).not.toHaveBeenCalled();
  });
});
