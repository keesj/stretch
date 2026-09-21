import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('renders with primary variant by default', () => {
    render(<Button>Primary</Button>);
    const button = screen.getByText('Primary') as HTMLButtonElement;
    expect(button).toHaveClass('bg-primary-600');
    expect(button).toHaveClass('text-white');
  });

  it('renders with secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByText('Secondary') as HTMLButtonElement;
    expect(button).toHaveClass('bg-calm-200');
    expect(button).toHaveClass('text-calm-800');
  });

  it('renders with outline variant', () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByText('Outline') as HTMLButtonElement;
    expect(button).toHaveClass('border-primary-600');
    expect(button).toHaveClass('text-primary-600');
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByText('Custom') as HTMLButtonElement;
    expect(button).toHaveClass('custom-class');
  });

  it('passes props to the button element', () => {
    render(
      <Button data-testid="test-btn" aria-label="Test" disabled>
        Test
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Test' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-testid', 'test-btn');
  });

  it('calls onClick handler', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    const user = userEvent.setup();
    await user.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});