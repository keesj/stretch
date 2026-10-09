import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNavigation } from '../BottomNavigation';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocation: vi.fn(),
    useNavigate: () => vi.fn(),
  };
});

import { useLocation } from 'react-router-dom';

function at(pathname: string) {
  vi.mocked(useLocation).mockReturnValue({
    pathname,
    search: '',
    hash: '',
    state: null,
    key: 'default',
  });
}

function renderNav() {
  return render(
    <MemoryRouter>
      <BottomNavigation />
    </MemoryRouter>
  );
}

describe('BottomNavigation', () => {
  it('renders the navigation items', () => {
    at('/');
    renderNav();

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('has no Session tab (the workout flow is entered from Home)', () => {
    at('/');
    renderNav();
    expect(screen.queryByText('Session')).not.toBeInTheDocument();
  });

  it('marks the current route as active', () => {
    at('/progress');
    renderNav();

    const progressLink = screen.getByText('Progress').closest('a');
    expect(progressLink).toHaveClass('text-primary-600');
    expect(progressLink).toHaveClass('dark:text-primary-400');
    expect(progressLink).toHaveAttribute('aria-current', 'page');

    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink).not.toHaveClass('text-primary-600');
    expect(homeLink).not.toHaveAttribute('aria-current');
  });

  it('highlights home when on home route', () => {
    at('/');
    renderNav();
    expect(screen.getByText('Home').closest('a')).toHaveClass('text-primary-600');
  });

  it('highlights settings when on settings route', () => {
    at('/settings');
    renderNav();
    expect(screen.getByText('Settings').closest('a')).toHaveClass('text-primary-600');
  });

  it('renders one line-art icon per navigation item', () => {
    at('/');
    const { container } = renderNav();
    const icons = container.querySelectorAll('a svg');
    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('stroke', 'currentColor');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
