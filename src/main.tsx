import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadFromStorage, DEFAULT_SETTINGS } from './utils/storage'

export function ThemeInitializer() {
  const settings = loadFromStorage('settings', DEFAULT_SETTINGS);
  
  useEffect(() => {
    try {
      const root = document.documentElement;
      
      const applyTheme = (theme: 'light' | 'dark' | 'system') => {
        if (theme === 'system') {
          try {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.classList.toggle('dark', prefersDark);
          } catch {
            root.classList.toggle('dark', false);
          }
        } else {
          root.classList.toggle('dark', theme === 'dark');
        }
      };
      
      applyTheme(settings.theme);
      
      const handleDarkMode = () => {
        applyTheme(settings.theme);
      };
      
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleDarkMode);
      }
      
      return () => {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', handleDarkMode);
        }
      };
    } catch {
      // theme initialization failed
    }
  }, [settings.theme]);
  
  return null;
}

try {
  createRoot(document.getElementById('root')!).render(
    <App />
  )
} catch (err) {
  console.error('App rendering failed:', err);
  document.body.innerHTML = '<div style="padding:2rem;color:red;font-family:sans-serif">App failed to load. Check console.</div>';
}