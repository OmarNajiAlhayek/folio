'use client';

import { type DragEvent, type ReactNode, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type FileDropZoneProps = {
  accept?: string;
  disabled?: boolean;
  uploading?: boolean;
  onFile: (file: File) => void;
  inputId?: string;
  ariaLabel: string;
  className?: string;
  children?: ReactNode;
};

export function FileDropZone({
  accept,
  disabled,
  uploading,
  onFile,
  inputId: inputIdProp,
  ariaLabel,
  className,
  children,
}: FileDropZoneProps) {
  const autoId = useId();
  const inputId = inputIdProp ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inactive = disabled || uploading;

  function pickFile(file: File | undefined) {
    if (!file || inactive) return;
    onFile(file);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!inactive) setIsDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'rounded-xl border border-dashed transition-colors',
        isDragging && !inactive
          ? 'border-accent/40 bg-accent/4'
          : 'border-ink/15 bg-transparent dark:border-white/15',
        inactive && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={inactive}
        aria-label={ariaLabel}
        onChange={(e) => {
          pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {children ?? (
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center"
        >
          <span className="text-sm font-medium text-ink/80">{ariaLabel}</span>
        </label>
      )}
      {uploading ? (
        <div
          className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-ink/10"
          role="progressbar"
          aria-label="Uploading"
        >
          <div className="h-full w-1/3 animate-[upload-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
        </div>
      ) : null}
    </div>
  );
}
