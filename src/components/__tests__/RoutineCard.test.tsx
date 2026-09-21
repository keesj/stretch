import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoutineCard } from '../RoutineCard';
import type { Routine } from '../../types/routine';

describe('RoutineCard', () => {
  const mockRoutine: Routine = {
    id: 'test-routine',
    title: 'Test Routine',
    description: 'A test routine description',
    stretches: ['stretch1', 'stretch2'],
  };

  it('renders routine title', () => {
    render(<RoutineCard routine={mockRoutine} stretchCount={2} totalDuration={120} />);
    expect(screen.getByText('Test Routine')).toBeInTheDocument();
  });

  it('renders routine description', () => {
    render(<RoutineCard routine={mockRoutine} stretchCount={2} totalDuration={120} />);
    expect(screen.getByText('A test routine description')).toBeInTheDocument();
  });

  it('renders stretch count', () => {
    render(<RoutineCard routine={mockRoutine} stretchCount={2} totalDuration={120} />);
    expect(screen.getByText('2 stretches')).toBeInTheDocument();
  });

  it('renders total duration in minutes', () => {
    render(<RoutineCard routine={mockRoutine} stretchCount={2} totalDuration={120} />);
    expect(screen.getByText('2 min')).toBeInTheDocument();
  });

  it('renders Start button', () => {
    render(<RoutineCard routine={mockRoutine} stretchCount={2} totalDuration={120} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('calls onStart when Start button is clicked', async () => {
    const onStart = vi.fn();
    render(<RoutineCard routine={mockRoutine} stretchCount={2} totalDuration={120} onStart={onStart} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('handles zero duration', () => {
    render(<RoutineCard routine={mockRoutine} stretchCount={0} totalDuration={0} />);
    expect(screen.getByText('0 min')).toBeInTheDocument();
  });
});