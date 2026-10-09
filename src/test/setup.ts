import '@testing-library/jest-dom';

// Ensure root element exists for modules that call createRoot (jsdom
// tests only; server tests run in a node environment without a DOM)
if (typeof document !== 'undefined') {
  const rootElement = document.createElement('div');
  rootElement.id = 'root';
  document.body.appendChild(rootElement);
}

// Mock localStorage — a real in-memory store (so code that writes a value
// and reads it back behaves like it does in a browser) wrapped in vi.fn,
// so tests can still assert on calls and override behavior per test.
const storageData = new Map<string, string>();
const readStore = (key: string) => (storageData.has(key) ? storageData.get(key)! : null);
const writeStore = (key: string, value: string) => {
  storageData.set(key, String(value));
};
const deleteStore = (key: string) => {
  storageData.delete(key);
};

const localStorageMock = {
  getItem: vi.fn(readStore),
  setItem: vi.fn(writeStore),
  removeItem: vi.fn(deleteStore),
  clear: vi.fn(() => {
    storageData.clear();
  }),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

// Mock crypto.randomUUID — unique per call (journal op ids must not
// collide) and shaped like a real UUIDv4, because identity code validates
// the stored account id against the UUIDv4 pattern.
let uuidSeq = 0;
vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
  uuidSeq += 1;
  return `aaaaaaaa-bbbb-4ccc-8ddd-${uuidSeq.toString(16).padStart(12, '0')}`;
});

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
  storageData.clear();
  localStorageMock.getItem.mockReset();
  localStorageMock.getItem.mockImplementation(readStore);
  localStorageMock.setItem.mockReset();
  localStorageMock.setItem.mockImplementation(writeStore);
  localStorageMock.removeItem.mockReset();
  localStorageMock.removeItem.mockImplementation(deleteStore);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
