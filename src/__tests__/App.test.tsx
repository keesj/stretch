import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

function setPath(path: string) {
  window.history.pushState({}, '', path);
}

describe('App', () => {
  beforeEach(() => {
    setPath('/');
  });

  it('renders Home at / with the bottom navigation', () => {
    render(<App />);
    expect(screen.getByText('Your daily flexibility routine')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('renders Session at /session and hides the bottom navigation', () => {
    setPath('/session');
    render(<App />);
    expect(screen.getByText(/Exercise 1 of/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders Settings at /settings with the bottom navigation', () => {
    setPath('/settings');
    render(<App />);
    expect(screen.getByText('Customize your experience')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
