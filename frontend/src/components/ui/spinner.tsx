import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "size-4 border-2",
  md: "size-6 border-2",
  lg: "size-8 border-[3px]",
} as const;

export type SpinnerSize = keyof typeof sizeClasses;

type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
  /** When true, hide from assistive tech (parent provides label). */
  "aria-hidden"?: boolean;
};

export function Spinner({
  size = "md",
  className,
  "aria-hidden": ariaHidden = true,
}: SpinnerProps) {
  return (
    <span
      aria-hidden={ariaHidden ? true : undefined}
      className={cn(
        "inline-block shrink-0 rounded-full border-ink/20 border-t-accent motion-safe:animate-spin",
        sizeClasses[size],
        className,
      )}
    />
  );
}

type LoadingCenterProps = {
  label: string;
  className?: string;
  size?: SpinnerSize;
  compact?: boolean;
};

/** Centered spinner with screen-reader-only loading label. */
export function LoadingCenter({
  label,
  className,
  size = "md",
  compact = false,
}: LoadingCenterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        compact ? "py-4" : "py-10 sm:py-12",
        className,
      )}
      aria-busy="true"
    >
      <Spinner size={size} />
      <span className="sr-only">{label}</span>
    </div>
  );
}
