import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timer } from '../Timer';

describe('Timer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the display time', () => {
    render(<Timer displayTime={60} isRunning={false} isPaused={false} />);
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('renders a different time value', () => {
    render(<Timer displayTime={30} isRunning={false} isPaused={false} />);
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows "Ready" when not running', () => {
    render(<Timer displayTime={60} isRunning={false} isPaused={false} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows "Running" when running', () => {
    render(<Timer displayTime={60} isRunning={true} isPaused={false} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows "Paused" when paused', () => {
    render(<Timer displayTime={60} isRunning={true} isPaused={true} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('shows "Almost Done" for transition message', () => {
    render(
      <Timer
        displayTime={5}
        isRunning={true}
        isPaused={false}
        countdownDisplay={5}
        isTransitionMessage={true}
      />
    );
    expect(screen.getByText('Almost Done')).toBeInTheDocument();
  });

  it('shows countdownDisplay when in transition mode', () => {
    render(
      <Timer
        displayTime={60}
        isRunning={true}
        isPaused={false}
        countdownDisplay={8}
        isTransitionMessage={true}
      />
    );
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('does not show countdownDisplay when not in transition mode', () => {
    render(
      <Timer
        displayTime={60}
        isRunning={true}
        isPaused={false}
        countdownDisplay={8}
      />
    );
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.queryByText('8')).not.toBeInTheDocument();
  });

  it('shows the 3-2-1 countdown with "Get ready…" while counting', () => {
    const { container } = render(<Timer displayTime={3} isRunning={false} isPaused={false} isCounting />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Get ready…')).toBeInTheDocument();
    // Progress bar is hidden during the countdown
    expect(container.querySelector('.h-1')).not.toBeInTheDocument();
  });

  it('renders progress bar', () => {
    const { container } = render(<Timer displayTime={60} isRunning={false} isPaused={false} />);
    const progressBar = container.querySelector('.h-1');
    expect(progressBar).toBeInTheDocument();
  });

  it('renders with custom total duration', () => {
    render(<Timer displayTime={45} isRunning={false} isPaused={false} totalDuration={90} />);
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('renders 0 min for short duration', () => {
    render(
      <div>
        <Timer displayTime={25} isRunning={true} isPaused={false} totalDuration={30} />
      </div>
    );
    expect(screen.getByText('25')).toBeInTheDocument();
  });
});