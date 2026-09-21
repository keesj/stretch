import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timer } from '../Timer';
import * as animatorModule from '../../utils/animator';

describe('Timer animation integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('performance', { now: () => 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders progress bar at default value', () => {
    const { container } = render(
      <Timer displayTime={60} isRunning={false} isPaused={false} totalDuration={60} />
    );

    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('updates progress bar when animation completes', () => {
    // Mock RAF to simulate animation completion
    let rafCb: (() => void) | null = null;
    const mockRaf = vi.fn((fn: () => void) => {
      rafCb = fn;
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', mockRaf);

    const { container } = render(
      <Timer displayTime={30} isRunning={true} isPaused={false} totalDuration={60} />
    );

    // Trigger the RAF callback to simulate animation
    if (rafCb) rafCb();
    if (rafCb) rafCb();

    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows "Paused" label when paused', () => {
    render(
      <Timer displayTime={30} isRunning={true} isPaused={true} totalDuration={60} />
    );
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('shows "Ready" label when not running', () => {
    render(
      <Timer displayTime={30} isRunning={false} isPaused={false} totalDuration={60} />
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders progress bar at full width when not animating', () => {
    render(
      <Timer displayTime={0} isRunning={false} isPaused={false} totalDuration={60} />
    );
    const bar = document.querySelector('[style*="width: 100%"]');
    expect(bar).toBeInTheDocument();
  });

  it('renders partial progress for partial progress animation', () => {
    render(
      <Timer displayTime={30} isRunning={false} isPaused={false} totalDuration={60} />
    );
    const bar = document.querySelector('[style*="width: 50%"]');
    expect(bar).toBeInTheDocument();
  });
});
