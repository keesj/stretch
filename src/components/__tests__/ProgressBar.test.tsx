import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
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