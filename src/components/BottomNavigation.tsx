import type { ComponentType, SVGProps } from "react";
import { Link, useLocation } from "react-router-dom";
import { CabinetIcon, HomeIcon, ProgressIcon, SettingsIcon, TrophyIcon } from "./icons";
import { useSquads } from "../sync/useSquads";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Hidden until the account belongs to at least one squad. */
  requiresSquad?: boolean;
}

// No "Session" tab: /session is the fullscreen workout flow, entered from
// the routine cards on Home. It hides this bar itself, so a nav item for
// it is a dead end (and landing on it without a chosen routine would
// just start the first one).
const navItems: NavItem[] = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/standings", label: "Squad", icon: TrophyIcon, requiresSquad: true },
  { to: "/chamber", label: "Chamber", icon: CabinetIcon, requiresSquad: true },
  { to: "/progress", label: "Progress", icon: ProgressIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function BottomNavigation() {
  const location = useLocation();
  const { squads } = useSquads();
  const visibleItems = navItems.filter((item) => !item.requiresSquad || squads.length > 0);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2">
      <div className="flex justify-around items-center max-w-md mx-auto">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center gap-1 p-2 min-h-[44px] min-w-[60px] ${
                isActive
                  ? "text-primary-600 dark:text-primary-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
