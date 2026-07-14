interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const progress = Math.min((current / total) * 100, 100);

  return (
    <div className="w-full">
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-600 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
        {current} of {total}
      </div>
    </div>
  );
}