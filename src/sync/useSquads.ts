import { useCallback, useEffect, useState } from "react";
import { fetchSquads } from "./syncClient";
import { getToken } from "./identity";
import type { Squad } from "./types";

/**
 * Last known squad list, shared across component mounts so the nav tabs
 * don't flicker hidden on every route change.
 */
let cachedSquads: Squad[] | null = null;

/**
 * The squads this account belongs to, refreshed on mount. Squads change
 * only via the server-side admin CLI, so a mount-time fetch plus a manual
 * refresh (the Standings page) is enough. On failure the last known list
 * is kept — the app stays usable offline.
 */
export function useSquads(): { squads: Squad[]; loading: boolean; refresh: () => Promise<void> } {
  const [squads, setSquads] = useState<Squad[]>(cachedSquads ?? []);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      cachedSquads = [];
      setSquads([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchSquads();
      cachedSquads = list;
      setSquads(list);
    } catch {
      if (cachedSquads === null) {
        cachedSquads = [];
        setSquads([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { squads, loading, refresh };
}
