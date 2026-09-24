import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "../components/Button";
import { loadFromStorage, type CompletedSession } from "../utils/storage";
import {
  loadPlankState,
  getChallengeStatus,
  getChallengeProgress,
} from "../utils/challenge";
import type { Challenge } from "../types/challenge";

import challengesData from "../data/challenges.json";

const CHART_W = 320;
const CHART_H = 140;
const CHART_PAD = 24;

function formatDayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatPlankPoints(points: number, isMissed: boolean): string {
  if (points > 0) return `+${points}`;
  if (isMissed) return "0";
  return "–";
}

export function ChallengeProgress() {
  const navigate = useNavigate();
  const challenge = useMemo(() => (challengesData as Challenge[])[0], []);

  const plankState = useMemo(() => loadPlankState(), []);
  const status = useMemo(
    () => getChallengeStatus(challenge, plankState),
    [challenge, plankState]
  );
  const progress = useMemo(() => {
    const sessions = loadFromStorage<CompletedSession[]>("completedSessions", []);
    const completions = sessions.map((s) => ({
      routineId: s.routineId,
      completedAt: s.completedAt,
    }));
    return getChallengeProgress(challenge, plankState, completions);
  }, [challenge, plankState]);

  const days = progress.days;
  const doneDays = days.filter((d) => !d.isFuture);
  const maxY = Math.max(...days.map((d) => d.runningTotal), 1);
  const innerW = CHART_W - 2 * CHART_PAD;
  const innerH = CHART_H - 2 * CHART_PAD;
  const x = (i: number) =>
    CHART_PAD + (days.length > 1 ? (i / (days.length - 1)) * innerW : 0);
  const y = (v: number) => CHART_H - CHART_PAD - (Math.max(v, 0) / maxY) * innerH;
  const linePoints = days.map((d, i) => `${x(i)},${y(d.runningTotal)}`).join(" ");
  const areaPoints = `${CHART_PAD},${CHART_H - CHART_PAD} ${linePoints} ${
    CHART_W - CHART_PAD
  },${CHART_H - CHART_PAD}`;

  const paceLabel =
    status.status === "complete"
      ? "Challenge complete"
      : status.deficit > 0
        ? `${status.deficit} pts behind pace`
        : "On pace";

  return (
    <div className="min-h-screen bg-gradient-to-b from-calm-50 via-calm-100 to-calm-200 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-6 pb-24 max-w-md mx-auto flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← Back
        </button>
        <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Point progress
        </h1>
        <div className="w-8" />
      </div>

      {!progress.started ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-7xl mb-6">{challenge.illustration}</div>
          <h2 className="text-2xl font-bold mb-2">No challenge yet</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-xs">
            Start the {challenge.totalDays}-day plank challenge and your points
            from planking and routines will show up here.
          </p>
          <Button onClick={() => navigate("/challenge")} className="w-full">
            Start Challenge
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Day {status.dayNumber} of {challenge.totalDays}
            </div>
            <div className="text-xs font-medium text-primary-600 dark:text-primary-400">
              {paceLabel}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                {progress.plankTotal}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Plank</div>
            </div>
            <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                {progress.routineTotal}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Routines
              </div>
            </div>
            <div className="bg-primary-500 dark:bg-primary-600 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">
                {progress.combinedTotal}
              </div>
              <div className="text-xs text-primary-100">Total</div>
            </div>
          </div>

          <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 mb-6">
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              className="w-full h-auto"
              role="img"
              aria-label="Point progress over the 30 days"
            >
              <line
                x1={CHART_PAD}
                y1={y(0)}
                x2={CHART_W - CHART_PAD}
                y2={y(0)}
                className="stroke-gray-300 dark:stroke-gray-600"
                strokeWidth="1"
              />
              <polygon
                points={areaPoints}
                className="fill-primary-200 dark:fill-primary-800"
                opacity="0.5"
              />
              <polyline
                points={linePoints}
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary-500 dark:stroke-primary-400"
              />
              {doneDays.map((d, i) => (
                <circle
                  key={d.date}
                  cx={x(i)}
                  cy={y(d.runningTotal)}
                  r={d.isToday ? 4 : 2.5}
                  className={
                    d.isMissed
                      ? "fill-red-500"
                      : "fill-primary-500 dark:fill-primary-400"
                  }
                />
              ))}
              <text
                x={CHART_PAD}
                y={CHART_H - 6}
                className="fill-gray-400 dark:fill-gray-500"
                fontSize="10"
              >
                Day 1
              </text>
              <text
                x={CHART_W - CHART_PAD}
                y={CHART_H - 6}
                textAnchor="end"
                className="fill-gray-400 dark:fill-gray-500"
                fontSize="10"
              >
                Day {days.length}
              </text>
            </svg>
          </div>

          <ul className="space-y-1.5 overflow-y-auto">
            {doneDays.map((d) => (
              <motion.li
                key={d.date}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                  d.isToday
                    ? "bg-primary-100 dark:bg-primary-900/40"
                    : "bg-white/60 dark:bg-gray-800/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 w-7">
                    D{d.dayNumber}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    {formatDayDate(d.date)}
                  </span>
                  {d.isToday && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                      Today
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-9 text-right font-medium ${
                      d.isMissed
                        ? "text-red-500 dark:text-red-400"
                        : d.plankPoints > 0
                          ? "text-primary-600 dark:text-primary-400"
                          : "text-gray-400"
                    }`}
                  >
                    {formatPlankPoints(d.plankPoints, d.isMissed)}
                  </span>
                  {d.routinePoints > 0 && (
                    <span className="w-9 text-right font-medium text-calm-600 dark:text-calm-300">
                      +{d.routinePoints}
                    </span>
                  )}
                  <span className="w-11 text-right font-bold text-gray-800 dark:text-gray-100">
                    {d.runningTotal}
                  </span>
                </div>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
