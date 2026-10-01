import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timer } from '../Timer';

const CIRCUMFERENCE = 2 * Math.PI * 120;

function getDashoffset(): number {
  const el = document.querySelector('circle[stroke-dashoffset]');
  expect(el).not.toBeNull();
  return Number.parseFloat(el!.getAttribute('stroke-dashoffset')!);
}

describe('Timer ring progress', () => {
  it('renders an empty ring at the start', () => {
    render(
      <Timer displayTime={60} isRunning={false} isPaused={false} totalDuration={60} />
    );
    expect(getDashoffset()).toBeCloseTo(CIRCUMFERENCE, 3);
  });

  it('renders the ring fully filled when the timer is done', () => {
    render(
      <Timer displayTime={0} isRunning={false} isPaused={false} totalDuration={60} />
    );
    expect(getDashoffset()).toBeCloseTo(0, 3);
  });

  it('renders half of the ring filled for half elapsed time', () => {
    render(
      <Timer displayTime={30} isRunning={false} isPaused={false} totalDuration={60} />
    );
    expect(getDashoffset()).toBeCloseTo(CIRCUMFERENCE / 2, 3);
  });

  it('tracks elapsed progress while running', () => {
    render(
      <Timer displayTime={15} isRunning={true} isPaused={false} totalDuration={60} />
    );
    // 75% elapsed => the ring is 75% filled, 25% of the circumference remains
    expect(getDashoffset()).toBeCloseTo(CIRCUMFERENCE / 4, 3);
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
});
