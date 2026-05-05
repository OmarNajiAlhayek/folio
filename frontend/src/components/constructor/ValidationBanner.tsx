"use client";

import { useTranslations } from "next-intl";
import type { ConstructorValidationError } from "@/lib/constructor-content.types";

interface ValidationBannerProps {
  errors: ConstructorValidationError[];
  /** Optional callback — when present, clicking an error scrolls/focuses the section. */
  onJump?: (sectionId: string) => void;
  /** When true, render as a hard error block (post-submit). Else as a soft amber checklist. */
  severity?: "warning" | "error";
}

/**
 * Pinned to the top of the constructor's section list. Renders the same
 * { code, message, sectionId } shape returned by the backend's submit-time
 * validator AND the frontend's live `validateConstructorContentLive`.
 *
 * Soft / amber for editing-time hints (default), red for post-submit errors.
 */
export function ValidationBanner({
  errors,
  onJump,
  severity = "warning",
}: ValidationBannerProps) {
  const t = useTranslations("ConstructorValidation");
  if (errors.length === 0) return null;

  const isError = severity === "error";
  const wrapperCls = isError
    ? "rounded-md border border-red-300/70 bg-red-100/70 px-4 py-3 text-sm text-red-900 dark:border-red-500/35 dark:bg-red-500/12 dark:text-red-200"
    : "rounded-md border border-amber-300/70 bg-amber-100/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-200";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={wrapperCls}
      data-testid="constructor-validation-banner"
    >
      <p className="font-medium">
        {isError ? t("blockedTitle") : t("checklistTitle")}
      </p>
      <ul className="mt-2 list-disc space-y-1 ps-5">
        {errors.map((e, idx) => (
          <li key={`${e.code}-${idx}`}>
            {e.sectionId && onJump ? (
              <button
                type="button"
                onClick={() => onJump(e.sectionId!)}
                className="text-start underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-current"
                data-testid={`constructor-validation-jump-${e.sectionId}`}
              >
                {e.message}
              </button>
            ) : (
              <span>{e.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
