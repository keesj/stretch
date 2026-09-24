import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Finished } from '../Finished';

const locationMock = { pathname: '/finished', search: '', hash: '', state: null, key: 'd' };
const navigateMockRef: { fn: any } = { fn: undefined! };

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => navigateMockRef.fn,
    useLocation: () => locationMock,
  };
});

describe('Finished Page', () => {
  beforeEach(() => {
    navigateMockRef.fn = vi.fn();
    locationMock.state = null;
  });

  it('renders with session data', () => {
    const session = {
      id: 'test-id',
      routineId: 'test-routine',
      routineTitle: 'Test Routine',
      duration: 120,
      completedAt: new Date().toISOString(),
    };

    locationMock.state = { session };

    render(<Finished />);

    expect(screen.getByText(/Great Job/i)).toBeInTheDocument();
    expect(screen.getByText(/Test Routine/i)).toBeInTheDocument();
    
    const durationText = screen.getByText(/2:00/);
    expect(durationText).toBeInTheDocument();
  });

  it('renders without session data', () => {
    render(<Finished />);

    expect(screen.getByText(/No Session/i)).toBeInTheDocument();
  });

  it('removes activeSession from localStorage when session is valid', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({ routineId: 'test-id' }));

    const session = {
      id: 'test-id',
      routineId: 'test-routine',
      routineTitle: 'Test Routine',
      duration: 120,
      completedAt: new Date().toISOString(),
    };

    locationMock.state = { session };

    render(<Finished />);

    expect(localStorage.removeItem).toHaveBeenCalledWith('activeSession');
  });

  it('removes activeSession on parse error in localStorage', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('not valid json');

    const session = {
      id: 'test-id',
      routineId: 'test-routine',
      routineTitle: 'Test Routine',
      duration: 120,
      completedAt: new Date().toISOString(),
    };

    locationMock.state = { session };

    render(<Finished />);

    expect(localStorage.removeItem).toHaveBeenCalledWith('activeSession');
  });

  it('does not remove activeSession when no session is passed via state', () => {
    // Clear mocks before rendering to only count calls from this render
    (localStorage.removeItem as ReturnType<typeof vi.fn>).mockClear();

    locationMock.state = null;
    render(<Finished />);

    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('calls navigate("/") on Done button click (line 37)', async () => {
    const session = {
      id: 'test-id',
      routineId: 'test-routine',
      routineTitle: 'Test Routine',
      duration: 120,
      completedAt: new Date().toISOString(),
    };

    locationMock.state = { session };

    try {
      render(<Finished />);
    } catch (e: any) {
      // Check what error is thrown
      console.error('Render error:', e.message);
      throw e;
    }

    await waitFor(() => {
      expect(screen.getByText('Back to Home')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Back to Home'));

    expect(navigateMockRef.fn).toHaveBeenCalledWith('/');
  });

  it('calls navigate("/") on Back to Home when no session', () => {
    render(<Finished />);

    fireEvent.click(screen.getByText('Back to Home'));

    expect(navigateMockRef.fn).toHaveBeenCalledWith('/');
  });
});