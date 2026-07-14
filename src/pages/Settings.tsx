import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import {
  loadFromStorage,
  saveToStorage,
  DEFAULT_SETTINGS,
  type Settings,
  type CompletedSession,
} from "../utils/storage";

export function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(() =>
    loadFromStorage("settings", DEFAULT_SETTINGS)
  );
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>(() =>
    loadFromStorage("completedSessions", [])
  );

  useEffect(() => {
    saveToStorage("settings", settings);
    applyTheme(settings.theme);
  }, [settings]);

  const applyTheme = (theme: "light" | "dark" | "system") => {
    const root = document.documentElement;
    
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
  };

  const handleResetProgress = () => {
    if (confirm("Are you sure you want to reset all progress? This cannot be undone.")) {
      localStorage.removeItem("completedSessions");
      setCompletedSessions([]);
      alert("Progress has been reset.");
    }
  };

  const handleReturnHome = () => {
    navigate("/");
  };

  const totalSessions = completedSessions.length;
  const totalMinutes = completedSessions.reduce((sum, s) => sum + s.duration, 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="px-4 py-6 pb-24 max-w-md mx-auto"
    >
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Customize your experience
        </p>
      </header>

      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Appearance</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span>Theme</span>
              <select
                value={settings.theme}
                onChange={(e) =>
                  setSettings({ ...settings, theme: e.target.value as "light" | "dark" | "system" })
                }
                className="input py-2 px-3 min-w-[120px]"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Preferences</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Sound</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, soundEnabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <span>Haptic Feedback</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.hapticEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, hapticEnabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Statistics</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Sessions</span>
              <span className="font-medium">{totalSessions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Time</span>
              <span className="font-medium">{Math.floor(totalMinutes / 60)} min</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Data</h2>
          <Button variant="outline" onClick={handleResetProgress} className="w-full">
            Reset Progress
          </Button>
        </Card>

        <Button onClick={handleReturnHome} className="w-full">
          Done
        </Button>
      </div>
    </motion.div>
  );
}