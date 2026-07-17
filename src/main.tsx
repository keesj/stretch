import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

function applyTheme() {
  const settings = localStorage.getItem('settings');
  if (settings) {
    const { theme } = JSON.parse(settings);
    const root = document.documentElement;
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  }
}

export function ThemeInitializer() {
  useEffect(() => {
    applyTheme();
    
    const handleDarkMode = () => {
      applyTheme();
    };
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', handleDarkMode);
    
    return () => {
      mediaQuery.removeEventListener('change', handleDarkMode);
    };
  }, []);
  
  return null;
}

createRoot(document.getElementById('root')!).render(
  <App />
)