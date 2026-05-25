"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface ModeSelectorProps {
  /** Pre-slug variant — both buttons just navigate; nothing on the server yet. */
  newSubmissionMode?: boolean;
  /**
   * Post-slug variant — the "Constructor" button kicks the user into the
   * constructor route for the existing draft.
   */
  slug?: string;
  /**
   * If true, render as inline cards inside the page (no extra wrapper).
   * Default = wrap in a card section.
   */
  inline?: boolean;
}

/**
 * Shortcuts to upload files on `/submissions/new` or open the pre-slug
 * constructor. On saved drafts, authors can use both upload and constructor
 * from the submission detail page without either path removing the other.
 */
export function ModeSelector({
  newSubmissionMode = false,
  slug,
  inline = false,
}: ModeSelectorProps) {
  const t = useTranslations("ConstructorMode");

  const uploadHref = newSubmissionMode
    ? "/submissions/new?mode=upload"
    : undefined;
  const constructorHref = newSubmissionMode
    ? "/submissions/compose/create"
    : slug
      ? `/submissions/${encodeURIComponent(slug)}/compose`
      : undefined;

  const cardCls =
    "block min-w-0 rounded-lg border border-ink/10 bg-paper/50 p-5 text-start transition-colors hover:border-accent/40 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40";

  const gridCls = "grid gap-4 sm:grid-cols-2";

  const cards = (
    <>
      {uploadHref ? (
        <Link
          href={uploadHref}
          className={cardCls}
          data-testid="constructor-mode-upload"
        >
          <ModeCardBody
            title={t("uploadTitle")}
            description={t("uploadDescription")}
          />
        </Link>
      ) : (
        <div className={cardCls}>
          <ModeCardBody
            title={t("uploadTitle")}
            description={t("uploadDescription")}
            disabled
          />
        </div>
      )}
      {constructorHref ? (
        <Link
          href={constructorHref}
          className={cardCls}
          data-testid="constructor-mode-builder"
        >
          <ModeCardBody
            title={t("constructorTitle")}
            description={t("constructorDescription")}
            badge={t("constructorBadge")}
          />
        </Link>
      ) : (
        <div className={cardCls}>
          <ModeCardBody
            title={t("constructorTitle")}
            description={t("constructorDescription")}
            badge={t("constructorBadge")}
            disabled
          />
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className={gridCls} role="group">
        {cards}
      </div>
    );
  }

  return (
    <section
      className="rounded-lg border border-ink/10 bg-surface shadow-sm p-6"
      aria-labelledby="constructor-mode-heading"
    >
      <h2
        id="constructor-mode-heading"
        className="font-serif text-lg font-semibold text-ink"
      >
        {t("heading")}
      </h2>
      <p className="mt-1 text-sm text-ink/65">{t("subheading")}</p>
      <div className={`mt-5 ${gridCls}`}>{cards}</div>
    </section>
  );
}

function ModeCardBody({
  title,
  description,
  badge,
  disabled,
}: {
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex h-full flex-col gap-2 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 font-serif text-base font-semibold text-ink">
          {title}
        </span>
        {badge ? (
          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-ink/70">{description}</p>
    </div>
  );
}
