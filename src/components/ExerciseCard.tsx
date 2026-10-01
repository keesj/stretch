import type { Stretch } from "../types/stretch";
import { StretchAnimation } from "./StretchAnimation";

interface ExerciseCardProps {
  exercise: Stretch;
}

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min` : `${seconds}s`;
}

export function ExerciseCard({ exercise }: ExerciseCardProps) {
  const difficultyColors = {
    easy: "text-green-600 dark:text-green-400",
    medium: "text-yellow-600 dark:text-yellow-400",
    hard: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="flex flex-col items-center text-center">
      {exercise.animation ? (
        <div className="w-full max-w-[240px] mb-4">
          <StretchAnimation stretch={exercise} />
        </div>
      ) : (
        <div className="text-6xl mb-4">{exercise.illustration}</div>
      )}
      <h2 className="text-2xl font-semibold mb-2">{exercise.title}</h2>
      <div className={`text-sm font-medium mb-3 ${difficultyColors[exercise.difficulty]}`}>
        {exercise.difficulty.charAt(0).toUpperCase() + exercise.difficulty.slice(1)}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        {formatDuration(exercise.duration)}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {exercise.bodyParts.map((part) => (
          <span
            key={part}
            className="px-3 py-1 bg-calm-100 dark:bg-calm-900/50 text-calm-700 dark:text-calm-300 rounded-full text-xs"
          >
            {part}
          </span>
        ))}
      </div>
    </div>
  );
}