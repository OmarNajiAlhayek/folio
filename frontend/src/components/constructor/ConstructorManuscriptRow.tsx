"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type ConstructorManuscriptStatusHint = "pending" | "attached";

type ConstructorManuscriptRowProps = {
  displayName: string;
  editHref: string;
  onRemove?: () => void;
  /** Defaults to “Clear constructor draft”. */
  removeLabel?: string;
  disabled?: boolean;
  statusHint?: ConstructorManuscriptStatusHint;
};

export function ConstructorManuscriptRow({
  displayName,
  editHref,
  onRemove,
  removeLabel,
  disabled = false,
  statusHint,
}: ConstructorManuscriptRowProps) {
  const t = useTranslations("ConstructorManuscript");

  return (
    <div
      className="rounded-lg border border-ink/10 bg-paper/40 px-4 py-3"
      data-testid="constructor-manuscript-row"
    >
      <p className="text-sm font-medium text-ink">{t("mainManuscriptLabel")}</p>
      {statusHint === "pending" ? (
        <p className="mt-1 text-xs text-ink/55">{t("pendingHint")}</p>
      ) : statusHint === "attached" ? (
        <p className="mt-1 text-xs text-ink/55">{t("attachedHint")}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="min-w-0 max-w-full truncate text-sm text-ink/80">
          {t("selectedLabel")}: {displayName}
        </span>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
          {t("badge")}
        </span>
        <Link
          href={editHref}
          className="text-sm text-accent hover:underline"
          data-testid="constructor-manuscript-edit"
        >
          {t("editDraft")}
        </Link>
        {onRemove ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            className="text-sm text-accent hover:underline disabled:pointer-events-none disabled:opacity-50"
            data-testid="constructor-manuscript-remove"
          >
            {removeLabel ?? t("clearConstructorDraft")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
