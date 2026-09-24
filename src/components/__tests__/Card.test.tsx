import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Content</Card>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('is clickable when onClick is provided', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Click me</Card>);
    // The onClick should be on the card div
    const allCards = document.querySelectorAll('.card');
    allCards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    
    expect(onClick).toHaveBeenCalled();
  });

  it('has cursor-pointer class when onClick is provided', () => {
    const { container } = render(<Card onClick={() => {}}>Content</Card>);
    expect(container.firstChild).toHaveClass('cursor-pointer');
    expect(container.firstChild).toHaveClass('hover:shadow-md');
  });

  it('does not have cursor-pointer when onClick is not provided', () => {
    const { container } = render(<Card>No click</Card>);
    expect(container.firstChild).not.toHaveClass('cursor-pointer');
  });

  it('renders empty children', () => {
    const { container } = render(<Card />);
    expect(container.firstChild).toHaveClass('card');
  });
});