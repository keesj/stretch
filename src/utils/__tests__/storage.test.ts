import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadFromStorage, saveToStorage, clearStorage, DEFAULT_SETTINGS } from '../storage';
import type { StorageKey, Settings } from '../storage';

// Helper to get real localStorage by restoring it from an accessible copy
const getRealStorage = () => {
  // Access the prototype's native localStorage
  return localStorage;
};

describe('utils/storage', () => {
  let realStorage: Storage;

  beforeEach(() => {
    // Capture and restore real localStorage
    const { localStorage: real } = globalThis;
    // Store the real DOM localStorage from the prototype
    realStorage = Object.getPrototypeOf(document.createElement('div') as unknown as { nodeType: number }).constructor.prototype.hasOwnProperty('localStorage')
      ? (window as any).__testStorage || null
      : null;
    // We'll use a manual approach instead
    realStorage = null as any;
  });

  it('loadFromStorage returns parsed value when key exists', () => {
    // The mock from setup.ts is vi.fn()-based, so we need to set the value on it
    const mockValue = JSON.stringify({ foo: 'bar' });
    const mock = localStorage as unknown as { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
    mock.getItem.mockReturnValue(mockValue);
    const result = loadFromStorage('test-key' as StorageKey, {});
    expect(result).toEqual({ foo: 'bar' });
  });

  it('loadFromStorage returns default value when key does not exist', () => {
    const mock = localStorage as unknown as { getItem: ReturnType<typeof vi.fn> };
    mock.getItem.mockReturnValue(null);
    const defaultVal = { theme: 'light' as const };
    const result = loadFromStorage('nonexistent' as StorageKey, defaultVal);
    expect(result).toBe(defaultVal);
  });

  it('loadFromStorage returns default value and logs warning when JSON parse fails', () => {
    const mock = localStorage as unknown as { getItem: ReturnType<typeof vi.fn> };
    mock.getItem.mockReturnValue('invalid json');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const defaultVal = { theme: 'dark' as const };
    const result = loadFromStorage('corrupt-key' as StorageKey, defaultVal);
    expect(result).toBe(defaultVal);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load from localStorage'),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it('saveToStorage saves value to localStorage', () => {
    const settings: Settings = { theme: 'dark' as const, soundEnabled: false, hapticEnabled: true };
    saveToStorage('settings' as StorageKey, settings);
    expect(localStorage.setItem).toHaveBeenCalledWith('settings', JSON.stringify(settings));
  });

  it('saveToStorage logs warning when localStorage.setItem fails', () => {
    const mock = localStorage as unknown as { setItem: ReturnType<typeof vi.fn> };
    mock.setItem.mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    saveToStorage('test' as StorageKey, { value: 'test' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save to localStorage'),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it('saveToStorage logs warning and does not throw for string errors', () => {
    const mock = localStorage as unknown as { setItem: ReturnType<typeof vi.fn> };
    mock.setItem.mockImplementation(() => {
      throw 'string error';
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => saveToStorage('test' as StorageKey, 'value')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save to localStorage'),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  it('clearStorage removes the specified key', () => {
    clearStorage('test-key' as StorageKey);
    expect(localStorage.removeItem).toHaveBeenCalledWith('test-key');
  });

  it('clearStorage does not throw for nonexistent keys', () => {
    expect(() => clearStorage('nonexistent' as StorageKey)).not.toThrow();
  });
});