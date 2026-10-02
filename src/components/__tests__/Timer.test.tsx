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

  it('shows the label override instead of the status label', () => {
    render(
      <Timer
        displayTime={5}
        isRunning={true}
        isPaused={false}
        label="Almost Done"
      />
    );
    expect(screen.getByText('Almost Done')).toBeInTheDocument();
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
  });

  it('shows the displayText override in the center', () => {
    render(
      <Timer displayTime={150} isRunning={false} isPaused={false} displayText="2:30" />
    );
    expect(screen.getByText('2:30')).toBeInTheDocument();
    expect(screen.queryByText('150')).not.toBeInTheDocument();
  });

  it('shows the breathing pulse circle while running with breathing enabled', () => {
    const { container } = render(<Timer displayTime={60} isRunning={true} isPaused={false} breathing />);
    expect(container.querySelector('.bg-primary-300')).toBeInTheDocument();
    expect(screen.queryByText('Breathe in')).not.toBeInTheDocument();
  });

  it('does not render the pulse circle when breathing is disabled', () => {
    const { container } = render(<Timer displayTime={60} isRunning={true} isPaused={false} />);
    expect(container.querySelector('.bg-primary-300')).not.toBeInTheDocument();
  });

  it('shows the main time with a +N suffix for the lead-in', () => {
    render(
      <Timer
        displayTime={62}
        isRunning={false}
        isPaused={false}
        totalDuration={63}
        countdownSeconds={3}
        countdownRemaining={2}
      />
    );
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('+ 2')).toBeInTheDocument();
  });

  it('shows the countdown inside the ring with "Get ready…" while counting', () => {
    const { container } = render(
      <Timer
        displayTime={33}
        isRunning={false}
        isPaused={false}
        isCounting
        totalDuration={33}
        countdownSeconds={3}
        countdownRemaining={3}
      />
    );
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('+ 3')).toBeInTheDocument();
    expect(screen.getByText('Get ready…')).toBeInTheDocument();
    // The ring stays on screen (empty) so the layout does not jump
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('circle.stroke-primary-500')).not.toBeInTheDocument();
  });

  it('shows a play icon when not running so the timer looks tappable', () => {
    const { container } = render(<Timer displayTime={60} isRunning={false} isPaused={false} />);
    expect(container.querySelector('svg[viewBox="0 0 24 24"]')).toBeInTheDocument();
  });

  it('hides the play icon while running', () => {
    const { container } = render(<Timer displayTime={60} isRunning={true} isPaused={false} />);
    expect(container.querySelector('svg[viewBox="0 0 24 24"]')).not.toBeInTheDocument();
  });

  it('hides the play icon while counting', () => {
    const { container } = render(
      <Timer
        displayTime={33}
        isRunning={false}
        isPaused={false}
        isCounting
        totalDuration={33}
        countdownSeconds={3}
        countdownRemaining={3}
      />
    );
    expect(container.querySelector('svg[viewBox="0 0 24 24"]')).not.toBeInTheDocument();
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
