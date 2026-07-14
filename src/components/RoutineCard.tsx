import type { Routine } from "../types/routine";
import { Card } from "./Card";
import { Button } from "./Button";

interface RoutineCardProps {
  routine: Routine;
  stretchCount: number;
  totalDuration: number;
  onStart?: () => void;
}

export function RoutineCard({
  routine,
  stretchCount,
  totalDuration,
  onStart,
}: RoutineCardProps) {
  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <h3 className="text-xl font-semibold mb-2">{routine.title}</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4">{routine.description}</p>
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
        <span>{stretchCount} stretches</span>
        <span>{Math.floor(totalDuration / 60)} min</span>
      </div>
      <Button onClick={onStart} className="w-full">
        Start
      </Button>
    </Card>
  );
}