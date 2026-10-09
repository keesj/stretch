import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { useSyncStore } from "./sync/useSyncStore";
import { Session } from "./pages/Session";
import { Finished } from "./pages/Finished";
import { Settings } from "./pages/Settings";
import { Challenge } from "./pages/Challenge";
import { ChallengeProgress } from "./pages/ChallengeProgress";
import { Progress } from "./pages/Progress";
import { BottomNavigation } from "./components/BottomNavigation";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useLocation } from "react-router-dom";

const FULLSCREEN_ROUTES = ["/session", "/challenge"];

function BottomNavWrapper() {
  const location = useLocation();
  return FULLSCREEN_ROUTES.includes(location.pathname) ? null : <BottomNavigation />;
}

/**
 * Sync triggers: on mount, on window focus, when the network comes back,
 * and periodically while the app is open. All fire-and-forget — the app
 * stays fully usable offline (local-first, sync catches up later).
 */
function useSyncTriggers() {
  useEffect(() => {
    const { syncNow } = useSyncStore.getState();
    void syncNow();

    const onFocus = () => void syncNow();
    const onOnline = () => void syncNow();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(() => void syncNow(), 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, []);
}

function App() {
  useSyncTriggers();
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-calm-50 dark:bg-gray-900">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/session" element={<Session />} />
            <Route path="/challenge" element={<Challenge />} />
            <Route path="/challenge/progress" element={<ChallengeProgress />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/finished" element={<Finished />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          <BottomNavWrapper />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;