import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timer } from '../Timer';

const CIRCUMFERENCE = 2 * Math.PI * 120;

function dashStart(container: HTMLElement, selector: string): number {
  const el = container.querySelector<SVGElement>(selector);
  expect(el, `missing ${selector}`).not.toBeNull();
  return Number.parseFloat(el!.getAttribute('stroke-dasharray')!.split(' ')[0]);
}

describe('Timer ring progress', () => {
  it('renders an empty ring at the start', () => {
    const { container } = render(
      <Timer displayTime={60} isRunning={false} isPaused={false} totalDuration={60} />
    );
    expect(container.querySelector('circle[stroke-dasharray]')).not.toBeInTheDocument();
  });

  it('renders the ring fully filled when the timer is done', () => {
    const { container } = render(
      <Timer displayTime={0} isRunning={false} isPaused={false} totalDuration={60} />
    );
    expect(dashStart(container, 'circle.stroke-primary-500')).toBeCloseTo(CIRCUMFERENCE, 3);
  });

  it('renders half of the ring filled for half elapsed time', () => {
    const { container } = render(
      <Timer displayTime={30} isRunning={false} isPaused={false} totalDuration={60} />
    );
    expect(dashStart(container, 'circle.stroke-primary-500')).toBeCloseTo(CIRCUMFERENCE / 2, 3);
  });

  it('tracks elapsed progress while running', () => {
    const { container } = render(
      <Timer displayTime={15} isRunning={true} isPaused={false} totalDuration={60} />
    );
    expect(dashStart(container, 'circle.stroke-primary-500')).toBeCloseTo((CIRCUMFERENCE * 3) / 4, 3);
  });

  it('marks the countdown segment before the start and fills nothing yet', () => {
    const { container } = render(
      <Timer
        displayTime={33}
        isRunning={false}
        isPaused={false}
        totalDuration={33}
        countdownSeconds={3}
      />
    );
    expect(dashStart(container, 'circle.stroke-calm-500')).toBeCloseTo((CIRCUMFERENCE * 3) / 33, 3);
    expect(dashStart(container, 'circle.stroke-calm-600')).toBeCloseTo(0, 3);
    expect(container.querySelector('circle.stroke-primary-500')).not.toBeInTheDocument();
  });

  it('fills the countdown segment while counting down', () => {
    const { container } = render(
      <Timer
        displayTime={32}
        isRunning={false}
        isPaused={false}
        isCounting
        totalDuration={33}
        countdownSeconds={3}
      />
    );
    expect(dashStart(container, 'circle.stroke-calm-600')).toBeCloseTo(CIRCUMFERENCE / 33, 3);
    expect(container.querySelector('circle.stroke-primary-500')).not.toBeInTheDocument();
  });

  it('keeps the countdown segment full and fills the main arc once the timer runs', () => {
    const { container } = render(
      <Timer
        displayTime={15}
        isRunning={true}
        isPaused={false}
        totalDuration={33}
        countdownSeconds={3}
      />
    );
    expect(dashStart(container, 'circle.stroke-calm-600')).toBeCloseTo((CIRCUMFERENCE * 3) / 33, 3);
    expect(dashStart(container, 'circle.stroke-primary-500')).toBeCloseTo((CIRCUMFERENCE * 15) / 33, 3);
    // The main arc starts where the countdown segment ends
    const main = container.querySelector<SVGElement>('circle.stroke-primary-500');
    expect(Number.parseFloat(main!.getAttribute('stroke-dashoffset')!)).toBeCloseTo(
      -((CIRCUMFERENCE * 3) / 33),
      3
    );
  });

  it('fills the main arc to the end when the timer is done', () => {
    const { container } = render(
      <Timer
        displayTime={0}
        isRunning={false}
        isPaused={false}
        totalDuration={33}
        countdownSeconds={3}
      />
    );
    expect(dashStart(container, 'circle.stroke-primary-500')).toBeCloseTo((CIRCUMFERENCE * 30) / 33, 3);
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
