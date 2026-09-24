import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('renders fallback element when error occurs', () => {
    function Thrower() {
      throw new Error('Test error message');
    }

    const fallback = <div data-testid="custom-fallback">Custom Error Fallback</div>;

    render(
      <ErrorBoundary fallback={fallback}>
        <Thrower />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error Fallback')).toBeInTheDocument();
  });

  it('renders default error UI when error occurs without custom fallback', () => {
    function Thrower() {
      throw new Error('Test error message');
    }

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('shows generic message when error has no message', () => {
    function ThrowerNull() {
      throw null;
    }

    render(
      <ErrorBoundary>
        <ThrowerNull />
      </ErrorBoundary>
    );

    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });

  it('does not render children in error state', () => {
    function Thrower() {
      throw new Error('Test error message');
    }

    render(
      <ErrorBoundary>
        <Thrower />
        <div>Should not appear</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });

  it('renders reload button in error state', () => {
    function Thrower() {
      throw new Error('Test error message');
    }

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    );

    // The error boundary should render the default error UI with a reload button
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
  });
});