import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Handle dark mode based on system preference
const handleDarkMode = () => {
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
};

handleDarkMode();

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handleDarkMode);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)