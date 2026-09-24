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

describe('BottomNavigation', () => {
  it('renders all navigation items', () => {
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    });

    render(
      <MemoryRouter>
        <BottomNavigation />
      </MemoryRouter>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('marks the current route as active', () => {
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/session',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    });

    render(
      <MemoryRouter>
        <BottomNavigation />
      </MemoryRouter>
    );

    const sessionLink = screen.getByText('Session').closest('a');
    expect(sessionLink).toHaveClass('text-primary-600');
    expect(sessionLink).toHaveClass('dark:text-primary-400');

    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink).not.toHaveClass('text-primary-600');
  });

  it('highlights home when on home route', () => {
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    });

    render(
      <MemoryRouter>
        <BottomNavigation />
      </MemoryRouter>
    );

    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink).toHaveClass('text-primary-600');
  });

  it('highlights settings when on settings route', () => {
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/settings',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    });

    render(
      <MemoryRouter>
        <BottomNavigation />
      </MemoryRouter>
    );

    const settingsLink = screen.getByText('Settings').closest('a');
    expect(settingsLink).toHaveClass('text-primary-600');
  });

  it('renders icons for each navigation item', () => {
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    });

    render(
      <MemoryRouter>
        <BottomNavigation />
      </MemoryRouter>
    );

    expect(screen.getByText('🏠')).toBeInTheDocument();
    expect(screen.getByText('⏱️')).toBeInTheDocument();
    expect(screen.getByText('⚙️')).toBeInTheDocument();
  });
});