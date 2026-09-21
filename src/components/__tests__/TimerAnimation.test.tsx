import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timer } from '../Timer';

describe('Timer progress bar', () => {
  it('renders progress bar at default value', () => {
    render(
      <Timer displayTime={60} isRunning={false} isPaused={false} totalDuration={60} />
    );

    expect(screen.getByText('Ready')).toBeInTheDocument();
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

  it('renders progress bar at full width when the timer is done', () => {
    render(
      <Timer displayTime={0} isRunning={false} isPaused={false} totalDuration={60} />
    );
    const bar = document.querySelector('[style*="width: 100%"]');
    expect(bar).toBeInTheDocument();
  });

  it('renders partial progress for half elapsed time', () => {
    render(
      <Timer displayTime={30} isRunning={false} isPaused={false} totalDuration={60} />
    );
    const bar = document.querySelector('[style*="width: 50%"]');
    expect(bar).toBeInTheDocument();
  });

  it('tracks elapsed progress while running', () => {
    render(
      <Timer displayTime={15} isRunning={true} isPaused={false} totalDuration={60} />
    );
    const bar = document.querySelector('[style*="width: 75%"]');
    expect(bar).toBeInTheDocument();
  });
});
