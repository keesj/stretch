import { renderHook } from '@testing-library/react';
import { useBeep } from '../useBeep';

interface AudioMocks {
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function installMockAudioContext(): AudioMocks {
  const createOscillator = vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { value: 0 },
    type: 'sine',
  }));
  const createGain = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  }));
  const close = vi.fn();

  function MockAudioContext() {
    this.createOscillator = createOscillator;
    this.createGain = createGain;
    this.destination = {};
    this.currentTime = 0;
    this.close = close;
  }

  Object.defineProperty(globalThis, 'AudioContext', {
    value: MockAudioContext,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'webkitAudioContext', {
    value: undefined,
    writable: true,
    configurable: true,
  });

  return { createOscillator, createGain, close };
}

describe('useBeep', () => {
  it('returns playBeep and playFinalBeep', () => {
    const { result } = renderHook(() => useBeep(true));
    expect(result.current).toHaveProperty('playBeep');
    expect(result.current).toHaveProperty('playFinalBeep');
    expect(typeof result.current.playBeep).toBe('function');
    expect(typeof result.current.playFinalBeep).toBe('function');
  });

  it('does not create audio nodes when disabled', () => {
    const mocks = installMockAudioContext();
    const { result } = renderHook(() => useBeep(false));

    result.current.playBeep(800, 0.1);
    result.current.playFinalBeep();

    expect(mocks.createOscillator).not.toHaveBeenCalled();
    expect(mocks.createGain).not.toHaveBeenCalled();
  });

  it('plays a beep with an oscillator and gain node when enabled', () => {
    const mocks = installMockAudioContext();
    const { result } = renderHook(() => useBeep(true));

    result.current.playBeep(800, 0.1);

    expect(mocks.createOscillator).toHaveBeenCalledTimes(1);
    expect(mocks.createGain).toHaveBeenCalledTimes(1);
    expect(mocks.createOscillator.mock.results[0].value.start).toHaveBeenCalled();
  });

  it('plays the final beep when enabled', () => {
    const mocks = installMockAudioContext();
    const { result } = renderHook(() => useBeep(true));

    result.current.playFinalBeep();

    expect(mocks.createOscillator).toHaveBeenCalledTimes(1);
    expect(mocks.createGain).toHaveBeenCalledTimes(1);
  });

  it('closes the audio context on unmount', () => {
    const mocks = installMockAudioContext();
    const { result, unmount } = renderHook(() => useBeep(true));

    result.current.playBeep(800, 0.1);
    expect(mocks.close).not.toHaveBeenCalled();

    unmount();

    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
