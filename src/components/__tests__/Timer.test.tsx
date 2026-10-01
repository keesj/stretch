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

  it('shows "Breathe in" while running with breathing enabled', () => {
    render(<Timer displayTime={60} isRunning={true} isPaused={false} breathing />);
    expect(screen.getByText('Breathe in')).toBeInTheDocument();
  });

  it('does not show breathing cues when breathing is disabled', () => {
    render(<Timer displayTime={60} isRunning={true} isPaused={false} />);
    expect(screen.queryByText('Breathe in')).not.toBeInTheDocument();
  });

  it('shows the 3-2-1 countdown inside the ring with "Get ready…"', () => {
    const { container } = render(<Timer displayTime={3} isRunning={false} isPaused={false} isCounting />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Get ready…')).toBeInTheDocument();
    // The ring stays on screen (empty) so the layout does not jump
    const ring = container.querySelector('circle[stroke-dashoffset]');
    expect(ring).toBeInTheDocument();
    expect(ring!.getAttribute('stroke-dashoffset')).toBe(ring!.getAttribute('stroke-dasharray'));
  });

  it('renders the ring when not counting', () => {
    const { container } = render(<Timer displayTime={60} isRunning={false} isPaused={false} />);
    expect(container.querySelectorAll('svg circle')).toHaveLength(2);
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
