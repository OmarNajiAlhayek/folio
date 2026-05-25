"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** `ltr` or `rtl` for dialog layout; defaults to `ltr`. */
  dir?: "ltr" | "rtl";
  confirmDisabled?: boolean;
};

/**
 * Accessible confirmation modal using native `<dialog>` + shared Folio modal styles.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  dir = "ltr",
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      cancelRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  function close() {
    onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      className="folio-logout-dialog m-0 box-border h-dvh max-h-dvh w-full max-w-none border-0 bg-transparent p-0"
      dir={dir}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
      onClose={close}
      onCancel={close}
    >
      <div className="pointer-events-none flex min-h-full w-full items-center justify-center p-4">
        <div
          className="folio-logout-dialog__panel pointer-events-auto w-full max-w-md rounded-2xl border border-ink/15 bg-surface p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.22)]"
          onClick={(e) => e.stopPropagation()}
          role="document"
        >
          <h2
            id={titleId}
            className="font-serif text-xl font-semibold text-ink"
          >
            {title}
          </h2>
          <div
            id={descId}
            className="mt-2 text-sm leading-relaxed text-ink/75"
          >
            {description}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={close}
              className="inline-flex rounded-md border border-ink/20 bg-paper px-4 py-2 text-sm font-medium text-ink shadow-sm hover:bg-ink/8"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={confirmDisabled}
              onClick={() => {
                onConfirm();
                close();
              }}
              className="inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
