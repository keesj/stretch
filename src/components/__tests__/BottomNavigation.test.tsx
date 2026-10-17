import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BottomNavigation } from '../BottomNavigation';
import { useSquads } from '../../sync/useSquads';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocation: vi.fn(),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../sync/useSquads', () => ({
  useSquads: vi.fn()
}));

import { useLocation } from 'react-router-dom';

const SQUAD = { id: 'squad-a', name: 'Alphas' };

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

beforeEach(() => {
  // An account in a squad sees the full bar; individual tests override.
  vi.mocked(useSquads).mockReturnValue({ squads: [SQUAD], loading: false, refresh: vi.fn() });
});

describe('BottomNavigation', () => {
  it('renders the navigation items for an account in a squad', () => {
    at('/');
    renderNav();

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Squad')).toBeInTheDocument();
    expect(screen.getByText('Chamber')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('hides the Squad and Chamber tabs until the account joins a squad', () => {
    vi.mocked(useSquads).mockReturnValue({ squads: [], loading: false, refresh: vi.fn() });
    at('/');
    renderNav();

    expect(screen.queryByText('Squad')).not.toBeInTheDocument();
    expect(screen.queryByText('Chamber')).not.toBeInTheDocument();
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

  it('renders one line-art icon per visible navigation item', () => {
    at('/');
    const { container } = renderNav();
    const icons = container.querySelectorAll('a svg');
    expect(icons).toHaveLength(5);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('stroke', 'currentColor');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('renders three icons when the social tabs are hidden', () => {
    vi.mocked(useSquads).mockReturnValue({ squads: [], loading: false, refresh: vi.fn() });
    at('/');
    const { container } = renderNav();
    expect(container.querySelectorAll('a svg')).toHaveLength(3);
  });
});
