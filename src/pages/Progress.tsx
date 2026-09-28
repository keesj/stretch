import { useMemo, useState } from "react";
import { loadFromStorage, type CompletedSession } from "../utils/storage";
import { loadPlankState } from "../utils/challenge";
import {
  getMonthBuckets,
  getOverallTotals,
  getYearBuckets,
} from "../utils/progress";
import type { Challenge, MonthDayBar, YearWeekBar } from "../types/challenge";

import challengesData from "../data/challenges.json";

const CHART_W = 320;
const CHART_H = 140;
const CHART_PAD = 24;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface BarChartProps {
  bars: Array<{ points: number; isToday?: boolean }>;
  labels: Array<{ index: number; text: string; anchor: "start" | "middle" | "end" }>;
  ariaLabel: string;
}

function BarChart({ bars, labels, ariaLabel }: BarChartProps) {
  const innerW = CHART_W - 2 * CHART_PAD;
  const innerH = CHART_H - 2 * CHART_PAD;
  const maxY = Math.max(...bars.map((b) => b.points), 1);
  const slot = innerW / bars.length;
  const barW = Math.max(slot * 0.7, 1.5);

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full h-auto"
      role="img"
      aria-label={ariaLabel}
    >
      <line
        x1={CHART_PAD}
        y1={CHART_H - CHART_PAD}
        x2={CHART_W - CHART_PAD}
        y2={CHART_H - CHART_PAD}
        className="stroke-gray-300 dark:stroke-gray-600"
        strokeWidth="1"
      />
      {bars.map((bar, i) => {
        const h = (bar.points / maxY) * innerH;
        if (bar.points <= 0) return null;
        return (
          <rect
            key={i}
            x={CHART_PAD + i * slot + (slot - barW) / 2}
            y={CHART_H - CHART_PAD - h}
            width={barW}
            height={h}
            rx={1.5}
            className={
              bar.isToday
                ? "fill-primary-600 dark:fill-primary-300"
                : "fill-primary-400 dark:fill-primary-600"
            }
          />
        );
      })}
      {labels.map((label) => (
        <text
          key={label.text}
          x={CHART_PAD + label.index * slot + slot / 2}
          y={CHART_H - 6}
          textAnchor={label.anchor}
          className="fill-gray-400 dark:fill-gray-500"
          fontSize="10"
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}

export function Progress() {
  const challenge = useMemo(() => (challengesData as Challenge[])[0], []);
  const plankState = useMemo(() => loadPlankState(), []);
  const sessions = useMemo(
    () => loadFromStorage<CompletedSession[]>("completedSessions", []),
    []
  );

  const now = new Date();
  const [monthCursor, setMonthCursor] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));

  const totals = useMemo(
    () => getOverallTotals(challenge, plankState, sessions),
    [challenge, plankState, sessions]
  );
  const monthBars = useMemo(
    () =>
      getMonthBuckets(challenge, plankState, sessions, monthCursor.year, monthCursor.month),
    [challenge, plankState, sessions, monthCursor]
  );
  const yearBars = useMemo(
    () => getYearBuckets(challenge, plankState, sessions, monthCursor.year),
    [challenge, plankState, sessions, monthCursor.year]
  );

  const isCurrentMonth =
    monthCursor.year === now.getFullYear() &&
    monthCursor.month === now.getMonth();

  const shiftMonth = (delta: number) => {
    setMonthCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const monthLabels = [
    { index: 0, text: "1", anchor: "start" as const },
    { index: 14, text: "15", anchor: "middle" as const },
    { index: monthBars.length - 1, text: `${monthBars.length}`, anchor: "end" as const },
  ];
  const yearLabels = [0, 3, 6, 9].flatMap((m) => {
    const index = yearBars.findIndex((b: YearWeekBar) => {
      const [, wm] = b.weekStart.split("-").map(Number);
      return wm - 1 === m;
    });
    return index >= 0 ? [{ index, text: MONTH_NAMES[m].slice(0, 3), anchor: "middle" as const }] : [];
  });

  if (totals.total === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-calm-50 via-calm-100 to-calm-200 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-6 pb-24 max-w-md mx-auto flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="w-8" />
          <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Progress
          </h1>
          <div className="w-8" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-7xl mb-6">📈</div>
          <h2 className="text-2xl font-bold mb-2">No progress yet</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-xs">
            Complete a routine or a plank hold and your points will show up
            here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-calm-50 via-calm-100 to-calm-200 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-6 pb-24 max-w-md mx-auto flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="w-8" />
        <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Progress
        </h1>
        <div className="w-8" />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {totals.plank}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Plank</div>
        </div>
        <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {totals.routine}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Routines
          </div>
        </div>
        <div className="bg-primary-500 dark:bg-primary-600 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-white">{totals.total}</div>
          <div className="text-xs text-primary-100">Total</div>
        </div>
      </div>

      <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2"
          >
            ←
          </button>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {MONTH_NAMES[monthCursor.month]} {monthCursor.year}
          </div>
          <button
            onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="text-sm px-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
          >
            →
          </button>
        </div>
        <BarChart
          bars={monthBars as MonthDayBar[]}
          labels={monthLabels}
          ariaLabel={`Daily points for ${MONTH_NAMES[monthCursor.month]} ${monthCursor.year}`}
        />
      </div>

      <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          {monthCursor.year} · weekly
        </div>
        <BarChart
          bars={yearBars}
          labels={yearLabels}
          ariaLabel={`Weekly points for ${monthCursor.year}`}
        />
      </div>
    </div>
  );
}
