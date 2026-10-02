import type { Stretch } from "../types/stretch";
import { StretchAnimation } from "./StretchAnimation";

interface ExerciseCardProps {
  exercise: Stretch;
  /** Animate the pose (false = still) */
  playing?: boolean;
}

export function ExerciseCard({ exercise, playing = true }: ExerciseCardProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="mb-4 text-2xl font-semibold">{exercise.title}</h2>
      {exercise.animation ? (
        <div className="w-full max-w-[240px]">
          <StretchAnimation stretch={exercise} playing={playing} />
        </div>
      ) : (
        <div className="text-6xl">{exercise.illustration}</div>
      )}
    </div>
  );
}
