import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from '../Home';

const navigateMockRef = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => navigateMockRef.fn,
  };
});

function mockStoredSessions(sessions: unknown) {
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
    key === 'completedSessions' ? JSON.stringify(sessions) : null
  );
}

function activeSessionSaveCalls() {
  return (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([key]) => key === 'activeSession'
  );
}

describe('Home Page', () => {
  beforeEach(() => {
    navigateMockRef.fn.mockClear();
  });

  it('renders the page heading and description', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByText('Stretch')).toBeInTheDocument();
    expect(screen.getByText('Your daily flexibility routine')).toBeInTheDocument();
  });

  it('renders Featured, All Routines, and the Settings link', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByText('All Routines')).toBeInTheDocument();
    expect(screen.getByText('⚙️ Settings')).toBeInTheDocument();
  });

  it('renders a Start button for every routine', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getAllByRole('button', { name: /Start/i })).toHaveLength(5);
  });

  it('shows session stats when sessions exist', () => {
    mockStoredSessions([
      { id: '1', routineId: 'r1', routineTitle: 'Morning', duration: 300, completedAt: new Date().toISOString() },
      { id: '2', routineId: 'r2', routineTitle: 'Afternoon', duration: 180, completedAt: new Date().toISOString() },
      { id: '3', routineId: 'r3', routineTitle: 'Evening', duration: 240, completedAt: new Date().toISOString() },
    ]);

    render(<MemoryRouter><Home /></MemoryRouter>);

    const stats = screen.getByText('sessions completed').closest('.flex')!;
    expect(within(stats).getByText('3')).toBeInTheDocument();
    // 300 + 180 + 240 = 720 seconds = 12 minutes
    expect(within(stats).getByText('12')).toBeInTheDocument();
  });

  it('hides session stats when no sessions exist', () => {
    mockStoredSessions([]);
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.queryByText('sessions completed')).not.toBeInTheDocument();
  });

  it('saves the active session and navigates to /session when starting the featured routine', () => {
    mockStoredSessions([]);
    render(<MemoryRouter><Home /></MemoryRouter>);

    fireEvent.click(screen.getAllByRole('button', { name: /Start/i })[0]);

    expect(navigateMockRef.fn).toHaveBeenCalledWith('/session');
    expect(activeSessionSaveCalls()).toHaveLength(1);
    expect(JSON.parse(activeSessionSaveCalls()[0][1])).toMatchObject({
      routineId: 'wake-up-workout',
      currentExerciseIndex: 0,
    });
  });

  it('starts the routine from the All Routines section', () => {
    mockStoredSessions([]);
    render(<MemoryRouter><Home /></MemoryRouter>);

    // Last routine in the All Routines section
    fireEvent.click(screen.getAllByRole('button', { name: /Start/i })[4]);

    expect(navigateMockRef.fn).toHaveBeenCalledWith('/session');
    expect(JSON.parse(activeSessionSaveCalls()[0][1])).toMatchObject({
      routineId: 'flexibility-builder',
    });
  });

  it('updates session stats when a storage event fires', () => {
    let stored = '[]';
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === 'completedSessions' ? stored : null
    );

    render(<MemoryRouter><Home /></MemoryRouter>);

    expect(screen.queryByText('sessions completed')).not.toBeInTheDocument();

    act(() => {
      stored = JSON.stringify([
        { id: '1', routineId: 'r1', routineTitle: 'Test', duration: 120, completedAt: new Date().toISOString() },
      ]);
      window.dispatchEvent(new StorageEvent('storage', { key: 'completedSessions' }));
    });

    const stats = screen.getByText('sessions completed').closest('.flex')!;
    expect(within(stats).getByText('1')).toBeInTheDocument();
  });
});
