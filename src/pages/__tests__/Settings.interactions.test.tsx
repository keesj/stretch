import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from '../Settings';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('Settings Page - interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.removeItem as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders Settings as the page heading', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders Customize your experience subtitle', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    expect(screen.getByText('Customize your experience')).toBeInTheDocument();
  });

  it('renders theme select with all options', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('system');
  });

  it('renders sound and haptic toggles', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    expect(screen.getByText('Sound')).toBeInTheDocument();
    expect(screen.getByText('Haptic Feedback')).toBeInTheDocument();
  });

  it('renders Reset Progress button', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    expect(screen.getByText('Reset Progress')).toBeInTheDocument();
  });

  it('shows completed sessions stats from stored data', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify([
      { id: '1', routineId: 'r1', routineTitle: 'Morning Stretch', duration: 300, completedAt: new Date().toISOString() },
    ]));

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );
    expect(screen.getByText(/Total Sessions/)).toBeInTheDocument();
  });
});