import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type FieldError = { message?: string } | string | null | undefined;

function getErrorMessage(error: FieldError): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  return error.message ?? null;
}

type FormFieldProps = {
  label: string;
  error?: FieldError;
  hint?: string;
  hintId?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
};

export function FormField({
  label,
  error,
  hint,
  hintId,
  icon,
  children,
  className,
  required,
}: FormFieldProps) {
  const errorMsg = getErrorMessage(error);
  return (
    <label className={cn('flex flex-col gap-1 text-sm', className)}>
      <span className="font-semibold text-ink/80">
        {label}
        {required && (
          <span className="ms-0.5 text-red-500" aria-hidden>
            *
          </span>
        )}
      </span>
      <div className="relative flex items-center">
        {icon && (
          <div
            className="pointer-events-none absolute start-3 z-10 text-ink/35"
            aria-hidden
          >
            {icon}
          </div>
        )}
        {children}
      </div>
      {errorMsg && (
        <span className="mt-0.5 text-xs text-red-600">{errorMsg}</span>
      )}
      {hint && (
        <span
          id={hintId}
          className="mt-0.5 text-[10px] leading-tight text-ink/50"
        >
          {hint}
        </span>
      )}
    </label>
  );
}
