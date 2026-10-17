import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { fetchStandings } from "../sync/syncClient";
import { useSquads } from "../sync/useSquads";
import { computeStandings, type StandingsView } from "../utils/standings";
import { getUserId } from "../sync/identity";
import { useDataRevision } from "../sync/dataChange";
import { activeChallenge } from "../utils/challenge";
import { formatTime } from "../utils/timer";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function Standings() {
  // Every configured challenge is a shared-clock cohort, so the squad
  // always competes in whatever cohort the account is on right now (the
  // running one, the finished one during the rest gap, or the next one).
  const revision = useDataRevision();
  // oxlint-disable-next-line react/memo-dependencies react-hooks/exhaustive-deps
  const cohort = useMemo(() => activeChallenge(), [revision]);
  const { squads, loading: squadsLoading, refresh: refreshSquads } = useSquads();
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [view, setView] = useState<StandingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The squad on display: the one the user picked, else the first one.
  const activeSquad = squads.find((s) => s.id === selectedSquadId) ?? squads[0] ?? null;
  const activeSquadId = activeSquad ? activeSquad.id : null;

  const load = useCallback(async (squadId: string) => {
    if (!cohort) return;
    try {
      const feed = await fetchStandings(cohort.syncId, squadId);
      setView(computeStandings(cohort, feed, getUserId()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the squad.");
    } finally {
      setLoading(false);
    }
  }, [cohort]);

  useEffect(() => {
    if (activeSquadId) void load(activeSquadId);
  }, [activeSquadId, load]);

  if (!cohort) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-calm-50 dark:bg-gray-900 px-4">
        <div className="text-gray-600 dark:text-gray-400">No shared challenge yet.</div>
      </div>
    );
  }

  if (squads.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-calm-50 via-calm-100 to-calm-200 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-6 pb-24 max-w-md mx-auto">
        <h1 className="text-3xl font-bold mb-6">Squad</h1>
        <Card className="p-4">
          {squadsLoading ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">Checking your squads…</div>
          ) : (
            <>
              <div className="text-sm font-semibold mb-2">No squad yet</div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You&apos;re not in a squad yet. Squads are set up on the server — ask your
                organizer to add your account, then check back here.
              </p>
              <Button
                variant="outline"
                onClick={() => void refreshSquads()}
                disabled={squadsLoading}
                className="mt-4 px-3 py-1.5 text-xs"
              >
                Check again
              </Button>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-calm-50 via-calm-100 to-calm-200 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-6 pb-24 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Squad</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {activeSquad ? `${activeSquad.name} · ${cohort.title}` : cohort.title}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void refreshSquads();
            if (activeSquadId) void load(activeSquadId);
          }}
          disabled={loading}
          className="px-3 py-1.5 text-xs"
        >
          {loading ? "…" : "Refresh"}
        </Button>
      </div>

      {squads.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {squads.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSquadId(s.id)}
              aria-pressed={activeSquadId === s.id}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                activeSquadId === s.id
                  ? "bg-primary-600 text-white"
                  : "bg-white/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <Card className="p-4 mb-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">{error}</div>
        </Card>
      )}

      {view && (
        <>
          {/* Yesterday's podium — the daily reveal. */}
          <Card className="p-4 mb-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
              Yesterday · {dayLabel(view.yesterday)}
            </div>
            {view.podium.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">{view.taunt}</div>
            ) : (
              <>
                <div className="space-y-2">
                  {view.podium.map((m, i) => (
                    <motion.div
                      key={m.accountId}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                        i === 0
                          ? "bg-primary-50 dark:bg-primary-900/30"
                          : "bg-white/60 dark:bg-gray-800/60"
                      }`}
                    >
                      <div className="text-2xl w-8 text-center">{MEDALS[i]}</div>
                      <div className="text-2xl">{m.avatar}</div>
                      <div
                        className="flex-1 text-sm font-semibold truncate"
                        style={{ color: m.color }}
                      >
                        {m.name}
                        {m.title && (
                          <span className="ml-1.5 text-[10px] font-normal text-gray-500 dark:text-gray-400">
                            {m.title.emoji} {m.title.label}
                          </span>
                        )}
                        {m.isMe && <span className="ml-1 text-[10px] font-normal text-gray-400">(you)</span>}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">{formatTime(m.yesterdaySeconds)}</div>
                        <div className="text-xs text-primary-600 dark:text-primary-400">
                          +{m.yesterdayPoints} pts
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {view.taunt && (
                  <p className="mt-3 text-xs italic text-gray-500 dark:text-gray-400">{view.taunt}</p>
                )}
              </>
            )}
          </Card>

          {/* Overall leaderboard. */}
          <Card className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
              Overall
            </div>
            {view.members.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Nobody in the squad yet. Set your name in Settings and complete a day —
                you&apos;ll be first on the board.
              </div>
            ) : (
              <div className="space-y-1.5">
                {view.members.map((m) => (
                  <div
                    key={m.accountId}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                      m.isMe ? "bg-primary-50 dark:bg-primary-900/30" : "bg-white/60 dark:bg-gray-800/60"
                    }`}
                  >
                    <div className="w-6 text-center text-sm font-bold text-gray-400">{m.rank}</div>
                    <div className="text-xl">{m.avatar}</div>
                    <div
                      className="flex-1 text-sm font-semibold truncate"
                      style={{ color: m.color }}
                    >
                      {m.name}
                      {m.title && (
                        <span className="ml-1.5 text-[10px] font-normal text-gray-500 dark:text-gray-400">
                          {m.title.emoji} {m.title.label}
                        </span>
                      )}
                      {m.isMe && <span className="ml-1 text-[10px] font-normal text-gray-400">(you)</span>}
                    </div>
                    {m.streak >= 2 && (
                      <div className="text-xs font-medium text-orange-500" title={`${m.streak}-day streak`}>
                        🔥{m.streak}
                      </div>
                    )}
                    <div className="w-14 text-right">
                      {m.startedAt ? (
                        <div className="text-sm font-bold">{m.totalPoints} pts</div>
                      ) : (
                        <div className="text-xs text-gray-400">not started</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-[11px] text-gray-400 dark:text-gray-500">
              Standings are revealed once a day ends. Today&apos;s holds stay secret until
              tomorrow — no live race, just the next-day reveal.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
