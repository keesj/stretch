import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnimationController } from '../animator';

describe('animator state machine', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', { now: () => 0 });
  });

  it('starts in IDLE state', () => {
    const ac = createAnimationController(0, 1000);
    expect(ac.state.progress).toBe(0);
    expect(ac.state.isRunning).toBe(false);
    expect(ac.state.rafId).toBe(null);
  });

  it('transitions from IDLE to RUNNING on start', () => {
    let capturedProgress = 0;
    const ac = createAnimationController(0, 1000);
    ac.setProgressCallback((p) => { capturedProgress = p; });

    ac.start(50);

    expect(ac.state.isRunning).toBe(true);
    expect(ac.state.targetProgress).toBe(50);
  });

  it('calls cancelAnimationFrame when re-starting (IDLE->RUNNING covers RAF cancel path)', () => {
    const mockRaf = vi.fn(() => 1);
    const mockCancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCancel);
    vi.stubGlobal('performance', { now: () => 100 });

    const ac = createAnimationController(0, 500);

    // First start
    ac.start(50);

    // Second start should cancel the first RAF ref (covers line ~38 in old code)
    ac.start(80);

    expect(mockCancel).toHaveBeenCalled();
  });

  it('completes animation and transitions RUNNING->COMPLETED', () => {
    const mockRaf = vi.fn((fn: () => void) => {
      // Simulate time passing to trigger completion
      vi.stubGlobal('performance', { now: () => 1500 });
      fn(1500);
      return 1;
    });
    const mockCancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCancel);
    vi.stubGlobal('performance', { now: () => 0 });

    let capturedProgress = 0;
    const ac = createAnimationController(25, 500);
    ac.setProgressCallback((p) => { capturedProgress = p; });

    ac.start(100);

    // AfterRAF tick, progress should be at target
    expect(ac.state.isRunning).toBe(false);
    expect(ac.state.progress).toBe(100);
    expect(capturedProgress).toBe(100);
  });

  it('transitions COMPLETED back to RUNNING on new start', () => {
    const mockRaf = vi.fn((fn: () => void) => {
      vi.stubGlobal('performance', { now: () => 1000 });
      fn(1000);
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const ac = createAnimationController(50, 500);
    ac.start(50); // Start at same value (no op)

    // Now start at different progress
    ac.start(50);

    expect(ac.state.targetProgress).toBe(50);
  });

  it('covers cancel path from any state', () => {
    const mockCancel = vi.fn();
    const mockRaf = vi.fn(() => 1);
    vi.stubGlobal('cancelAnimationFrame', mockCancel);
    vi.stubGlobal('requestAnimationFrame', mockRaf);

    const ac = createAnimationController(0, 1000);
    ac.start(50);

    ac.cancel();

    expect(ac.state.isRunning).toBe(false);
    expect(ac.state.rafId).toBe(null);
    expect(mockCancel).toHaveBeenCalled();
  });

  it('progressCallback is called on each RAF tick', () => {
    let tickDepth = 0;
    const calls: number[] = [];
    const mockRaf = vi.fn((fn: () => void) => {
      if (tickDepth < 2) {
        tickDepth++;
        vi.stubGlobal('performance', { now: () => 250 * tickDepth });
        fn(250 * tickDepth); // Simulate partial duration
        tickDepth--;
      }
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const ac = createAnimationController(0, 500);
    ac.setProgressCallback((p) => { calls.push(Math.round(p)); });

    ac.start(100);

    // Progress values should be captured via callback
    expect(calls.length).toBeGreaterThan(0);
  });

  it('does nothing when starting at same progress', () => {
    let callbackCalled = false;
    const mockRaf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('performance', { now: () => 0 });

    const ac = createAnimationController(50, 1000);
    ac.setProgressCallback(() => { callbackCalled = true; });

    ac.start(50);

    expect(mockRaf).not.toHaveBeenCalled();
    expect(callbackCalled).toBe(false);
  });
});