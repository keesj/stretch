import type { ReactNode } from "react";
import type { Stretch } from "../types/stretch";
import { StretchAnimation } from "./StretchAnimation";

interface ExerciseCardProps {
  exercise: Stretch;
  /** Optional node rendered next to the animation/illustration (e.g. a timer) */
  aside?: ReactNode;
}

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min` : `${seconds}s`;
}

function ExerciseVisual({ exercise }: { exercise: Stretch }) {
  return exercise.animation ? (
    <StretchAnimation stretch={exercise} />
  ) : (
    <div className="text-5xl">{exercise.illustration}</div>
  );
}

export function ExerciseCard({ exercise, aside }: ExerciseCardProps) {
  const difficultyColors = {
    easy: "text-green-600 dark:text-green-400",
    medium: "text-yellow-600 dark:text-yellow-400",
    hard: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="mb-1 text-2xl font-semibold">{exercise.title}</h2>
      <div className={`mb-1 text-sm font-medium ${difficultyColors[exercise.difficulty]}`}>
        {exercise.difficulty.charAt(0).toUpperCase() + exercise.difficulty.slice(1)}
      </div>
      <div className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        {formatDuration(exercise.duration)}
      </div>
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {exercise.bodyParts.map((part) => (
          <span
            key={part}
            className="rounded-full bg-calm-100 px-3 py-1 text-xs text-calm-700 dark:bg-calm-900/50 dark:text-calm-300"
          >
            {part}
          </span>
        ))}
      </div>
      {aside ? (
        <div className="flex w-full items-center justify-center gap-2">
          <div className="w-40 shrink-0">
            <ExerciseVisual exercise={exercise} />
          </div>
          <div className="shrink-0">{aside}</div>
        </div>
      ) : (
        <div className="w-full max-w-[240px]">
          <ExerciseVisual exercise={exercise} />
        </div>
      )}
    </div>
  );
}
