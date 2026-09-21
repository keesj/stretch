import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders current and total', () => {
    render(<ProgressBar current={1} total={3} />);
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('renders 0 of total', () => {
    render(<ProgressBar current={0} total={5} />);
    expect(screen.getByText('0 of 5')).toBeInTheDocument();
  });

  it('renders at full progress', () => {
    render(<ProgressBar current={5} total={5} />);
    expect(screen.getByText('5 of 5')).toBeInTheDocument();
  });

  it('clamps progress at 100% for current > total', () => {
    const { container } = render(<ProgressBar current={10} total={5} />);
    const bar = container.querySelector('.h-2 div');
    expect(bar).toHaveStyle({ width: '100%' });
  });

  it('shows partial progress', () => {
    const { container } = render(<ProgressBar current={2} total={5} />);
    const bar = container.querySelector('.h-2 div');
    expect(bar).toHaveStyle({ width: '40%' });
  });
});