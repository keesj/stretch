import '@testing-library/jest-dom';

// Ensure root element exists for modules that call createRoot
const rootElement = document.createElement('div');
rootElement.id = 'root';
document.body.appendChild(rootElement);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

// Mock crypto.randomUUID
vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-12345');

// Mock react-router-dom useNavigate
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Reset per-test state so mock state never leaks between tests
beforeEach(() => {
  localStorageMock.getItem.mockReset();
  localStorageMock.getItem.mockImplementation(() => null);
  localStorageMock.setItem.mockReset();
  localStorageMock.removeItem.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});
