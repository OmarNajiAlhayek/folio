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
 * Two-card chooser shown only when a submission has not yet committed to a
 * mode (no manuscript file AND no constructor content). Once a mode is
 * chosen the host page hides the selector and renders the corresponding
 * flow. Switching modes later requires a deliberate "Switch mode" action
 * with cleanup confirmation (see plan section A).
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
    ? "/submissions/constructor/new"
    : slug
      ? `/submissions/${encodeURIComponent(slug)}/constructor`
      : undefined;

  const cardCls =
    "block rounded-lg border border-ink/10 bg-paper/50 p-5 text-start transition-colors hover:border-accent/40 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-accent/40";

  const wrapperCls = inline
    ? "grid gap-4 sm:grid-cols-2"
    : "rounded-lg border border-ink/10 bg-surface shadow-sm p-6";

  return (
    <section className={wrapperCls} aria-labelledby="constructor-mode-heading">
      {!inline && (
        <>
          <h2
            id="constructor-mode-heading"
            className="font-serif text-lg font-semibold text-ink"
          >
            {t("heading")}
          </h2>
          <p className="mt-1 text-sm text-ink/65">{t("subheading")}</p>
        </>
      )}
      <div className={inline ? "" : "mt-5 grid gap-4 sm:grid-cols-2"}>
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
          <ModeCardBody
            title={t("uploadTitle")}
            description={t("uploadDescription")}
            disabled
          />
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
          <ModeCardBody
            title={t("constructorTitle")}
            description={t("constructorDescription")}
            badge={t("constructorBadge")}
            disabled
          />
        )}
      </div>
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
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-serif text-base font-semibold text-ink">
          {title}
        </span>
        {badge ? (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-ink/70">{description}</p>
    </div>
  );
}
