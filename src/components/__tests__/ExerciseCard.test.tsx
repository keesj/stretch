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

  it('renders difficulty with correct color class', () => {
    render(<ExerciseCard exercise={mockStretch} />);
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });

  it('renders duration in minutes', () => {
    render(<ExerciseCard exercise={mockStretch} />);
    expect(screen.getByText('1 min')).toBeInTheDocument();
  });

  it('renders body parts as badges', () => {
    render(<ExerciseCard exercise={mockStretch} />);
    expect(screen.getByText('neck')).toBeInTheDocument();
    expect(screen.getByText('shoulders')).toBeInTheDocument();
  });

  it('renders medium difficulty', () => {
    const mediumStretch: Stretch = {
      ...mockStretch,
      difficulty: 'medium',
    };
    render(<ExerciseCard exercise={mediumStretch} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('renders hard difficulty', () => {
    const hardStretch: Stretch = {
      ...mockStretch,
      difficulty: 'hard',
    };
    render(<ExerciseCard exercise={hardStretch} />);
    expect(screen.getByText('Hard')).toBeInTheDocument();
  });

  it('handles multi-minute duration', () => {
    const longStretch: Stretch = {
      ...mockStretch,
      duration: 150,
    };
    render(<ExerciseCard exercise={longStretch} />);
    expect(screen.getByText('2 min')).toBeInTheDocument();
  });
});