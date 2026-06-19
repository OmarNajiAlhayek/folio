import { cn } from '@/lib/utils';

type CircularProgressProps = {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  labelClassName?: string;
  showLabel?: boolean;
};

export function CircularProgress({
  value,
  size = 64,
  strokeWidth = 5,
  className,
  labelClassName,
  showLabel = true,
}: CircularProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <svg className="size-full -rotate-90" aria-hidden>
        <circle
          cx={center}
          cy={center}
          r={radius}
          className="stroke-ink/5 dark:stroke-white/5"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          className="stroke-accent transition-all duration-500 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {showLabel ? (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-ink',
            labelClassName,
          )}
        >
          {Math.round(clamped)}%
        </div>
      ) : null}
    </div>
  );
}
