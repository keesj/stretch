import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { Session } from "./pages/Session";
import { Finished } from "./pages/Finished";
import { Settings } from "./pages/Settings";
import { BottomNavigation } from "./components/BottomNavigation";
import { useLocation } from "react-router-dom";

function BottomNavWrapper() {
  const location = useLocation();
  return location.pathname !== "/session" ? <BottomNavigation /> : null;
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-calm-50 dark:bg-gray-900">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/session" element={<Session />} />
          <Route path="/finished" element={<Finished />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        <BottomNavWrapper />
      </div>
    </BrowserRouter>
  );
}

export default App;