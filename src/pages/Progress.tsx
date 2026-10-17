import { useMemo, useState } from "react";
import { loadFromStorage, type CompletedSession } from "../utils/storage";
import { allChallengeEntries } from "../utils/challenge";
import {
  getMonthBuckets,
  getOverallTotals,
  getRecentDays,
  getWeekComparison,
  getYearBuckets,
  type ChallengeEntry,
} from "../utils/progress";
import { formatTime } from "../utils/timer";
import type { MonthDayBar, WindowDay, YearWeekBar } from "../types/challenge";

const CHART_W = 320;
const CHART_H = 140;
const CHART_PAD = 24;

const MINI_W = 140;
const MINI_H = 44;

function formatDayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Seven tiny bars — the shape of one 7-day window. */
function MiniBars({ days, ariaLabel }: { days: WindowDay[]; ariaLabel: string }) {
  const max = Math.max(...days.map((d) => d.points), 1);
  const slot = MINI_W / days.length;
  const barW = slot * 0.62;
  return (
    <svg
      viewBox={`0 0 ${MINI_W} ${MINI_H}`}
      className="mt-1.5 w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <line
        x1={0}
        y1={MINI_H - 2}
        x2={MINI_W}
        y2={MINI_H - 2}
        className="stroke-gray-200 dark:stroke-gray-700"
        strokeWidth="1"
      />
      {days.map((d, i) => {
        if (d.points <= 0) return null;
        const h = (d.points / max) * (MINI_H - 6);
        return (
          <rect
            key={d.date}
            x={i * slot + (slot - barW) / 2}
            y={MINI_H - 2 - h}
            width={barW}
            height={h}
            rx={2}
            className={
              d.isToday
                ? "fill-primary-600 dark:fill-primary-300"
                : "fill-primary-400 dark:fill-primary-600"
            }
          />
        );
      })}
    </svg>
  );
}

/** The trend chip: how the current window compares to the previous one. */
function weekDelta(current: number, previous: number) {
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return { label: `+${current} pts`, tone: "up" as const };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { label: "even", tone: "even" as const };
  return pct > 0
    ? { label: `▲ ${pct}%`, tone: "up" as const }
    : { label: `▼ ${Math.abs(pct)}%`, tone: "down" as const };
}

const DELTA_TONES: Record<"up" | "down" | "even", string> = {
  up: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  down: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
  even: "bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-300",
};

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
            // One bar per calendar day; the index is the day position.
            // oxlint-disable-next-line react/no-array-index-key
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
  // All-time points span every challenge (the self-start one and the
  // cohort one), each scored with its own formula.
  const entries = useMemo<ChallengeEntry[]>(() => allChallengeEntries(), []);
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
    () => getOverallTotals(entries, sessions),
    [entries, sessions]
  );
  const week = useMemo(
    () => getWeekComparison(entries, sessions),
    [entries, sessions]
  );
  const recent = useMemo(
    () => getRecentDays(entries, sessions),
    [entries, sessions]
  );
  const delta = weekDelta(week.current.points, week.previous.points);
  const monthBars = useMemo(
    () => getMonthBuckets(entries, sessions, monthCursor.year, monthCursor.month),
    [entries, sessions, monthCursor]
  );
  const yearBars = useMemo(
    () => getYearBuckets(entries, sessions, monthCursor.year),
    [entries, sessions, monthCursor.year]
  );

  const isCurrentMonth =
    monthCursor.year === now.getFullYear() &&
    monthCursor.month === now.getMonth();

  const shiftMonth = (months: number) => {
    setMonthCursor(({ year, month }) => {
      const d = new Date(year, month + months, 1);
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

      {/* The rolling 7-day windows: the answer to "am I doing more or less?" */}
      <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
            This week vs last week
          </div>
          {delta && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DELTA_TONES[delta.tone]}`}
            >
              {delta.label}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { title: "Last 7 days", win: week.current },
            { title: "Previous 7 days", win: week.previous },
          ].map(({ title, win }) => (
            <div key={title}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {title}
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                {win.points}
                <span className="ml-1 text-xs font-normal text-gray-400">pts</span>
              </div>
              <MiniBars days={win.days} ariaLabel={`Daily points for the ${title.toLowerCase()}`} />
              <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                {win.sessions} session{win.sessions === 1 ? "" : "s"}
                {win.plankSeconds > 0 && ` · ${formatTime(win.plankSeconds)} plank`} ·{" "}
                {win.activeDays}/7 days
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The last two weeks, day by day — what actually happened. */}
      <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 mb-6">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          Recent days
        </div>
        <ul className="space-y-1">
          {recent.map((d) => (
            <li
              key={d.date}
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${
                d.isToday
                  ? "bg-primary-100 dark:bg-primary-900/40"
                  : "bg-white/40 dark:bg-gray-800/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-12 text-sm font-medium text-gray-700 dark:text-gray-200">
                  {formatDayDate(d.date)}
                </span>
                {d.isToday && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                    Today
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                {d.sessions > 0 && (
                  <span>
                    {d.sessions} session{d.sessions === 1 ? "" : "s"}
                  </span>
                )}
                {d.plankSeconds > 0 && <span>{formatTime(d.plankSeconds)} plank</span>}
                {d.sessions === 0 && d.plankSeconds === 0 && <span>rest</span>}
              </div>
              <span
                className={`w-9 text-right text-sm font-bold ${
                  d.total > 0
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-gray-300 dark:text-gray-600"
                }`}
              >
                {d.total > 0 ? `+${d.total}` : "—"}
              </span>
            </li>
          ))}
        </ul>
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
