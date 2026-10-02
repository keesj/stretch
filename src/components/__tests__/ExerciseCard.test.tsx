import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExerciseCard } from '../ExerciseCard';
import type { Stretch } from '../../types/stretch';

describe('ExerciseCard', () => {
  const mockStretch: Stretch = {
    id: 'stretch1',
    title: 'Neck Stretch',
    duration: 60,
    instructions: ['Step 1', 'Step 2'],
    bodyParts: ['neck', 'shoulders'],
    difficulty: 'easy',
    illustration: '🧘',
  };

  it('renders illustration', () => {
    render(<ExerciseCard exercise={mockStretch} />);
    expect(screen.getByText('🧘')).toBeInTheDocument();
  });

  it('renders exercise title', () => {
    render(<ExerciseCard exercise={mockStretch} />);
    expect(screen.getByText('Neck Stretch')).toBeInTheDocument();
  });

  it('keeps the workout view clean: no duration, difficulty or body parts', () => {
    render(<ExerciseCard exercise={mockStretch} />);
    expect(screen.queryByText('1 min')).not.toBeInTheDocument();
    expect(screen.queryByText('Easy')).not.toBeInTheDocument();
    expect(screen.queryByText('neck')).not.toBeInTheDocument();
    expect(screen.queryByText('shoulders')).not.toBeInTheDocument();
  });

  it('renders the animation instead of the illustration when one is defined', () => {
    const { container } = render(
      <ExerciseCard exercise={{ ...mockStretch, animation: 'ankle-circles', side: 'left' }} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('🧘')).not.toBeInTheDocument();
  });
});
