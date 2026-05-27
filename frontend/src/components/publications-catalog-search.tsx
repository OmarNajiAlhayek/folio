"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ARABIC_DISCIPLINE_LABELS } from "@/lib/discipline-labels";
import type { SubmissionArticleType } from "@/lib/queries/submissions";
import type { PublicationCatalogFilters } from "@/lib/public-submissions-query";

const ARTICLE_TYPES: SubmissionArticleType[] = [
  "original_research",
  "review_article",
  "case_report",
  "short_communication",
  "other",
];

const DISCIPLINE_OPTIONS = ARABIC_DISCIPLINE_LABELS.filter(
  (l) => l !== "غير محدد",
);

type Props = {
  filters: PublicationCatalogFilters;
  onQuickQueryChange: (q: string) => void;
  onApplyAdvanced: (draft: PublicationCatalogFilters) => void;
  onClear: () => void;
  resultCount: number | null;
  loading: boolean;
};

export function PublicationsCatalogSearch({
  filters,
  onQuickQueryChange,
  onApplyAdvanced,
  onClear,
  resultCount,
  loading,
}: Props) {
  const t = useTranslations("Publications");
  const tWf = useTranslations("SubmissionWorkflow");
  const [quickQ, setQuickQ] = useState(filters.q ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [author, setAuthor] = useState(filters.author ?? "");
  const [discipline, setDiscipline] = useState(filters.discipline ?? "");
  const [articleType, setArticleType] = useState(filters.articleType ?? "");
  const [publishedFrom, setPublishedFrom] = useState(
    filters.publishedFrom ?? "",
  );
  const [publishedTo, setPublishedTo] = useState(filters.publishedTo ?? "");

  useEffect(() => {
    setQuickQ(filters.q ?? "");
  }, [filters.q]);

  useEffect(() => {
    setAuthor(filters.author ?? "");
    setDiscipline(filters.discipline ?? "");
    setArticleType(filters.articleType ?? "");
    setPublishedFrom(filters.publishedFrom ?? "");
    setPublishedTo(filters.publishedTo ?? "");
  }, [
    filters.author,
    filters.discipline,
    filters.articleType,
    filters.publishedFrom,
    filters.publishedTo,
  ]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (quickQ.trim() !== (filters.q ?? "").trim()) {
        onQuickQueryChange(quickQ);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [quickQ, filters.q, onQuickQueryChange]);

  const handleApply = useCallback(() => {
    onApplyAdvanced({
      q: filters.q,
      author: author.trim() || undefined,
      discipline: discipline || undefined,
      articleType: articleType || undefined,
      publishedFrom: publishedFrom.trim() || undefined,
      publishedTo: publishedTo.trim() || undefined,
    });
  }, [
    filters.q,
    author,
    discipline,
    articleType,
    publishedFrom,
    publishedTo,
    onApplyAdvanced,
  ]);

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="pub-catalog-q">
          {t("searchPlaceholder")}
        </label>
        <input
          id="pub-catalog-q"
          type="search"
          value={quickQ}
          onChange={(e) => setQuickQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-surface/90 px-4 py-2.5 text-sm text-ink outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="shrink-0 rounded-lg border border-ink/15 bg-surface/80 px-4 py-2.5 text-sm font-semibold text-ink/80 transition hover:border-ink/25 hover:text-ink"
          aria-expanded={advancedOpen}
        >
          {t("advancedSearch")}
        </button>
      </div>

      {advancedOpen ? (
        <div className="rounded-xl border border-ink/10 bg-surface/85 p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="pub-adv-author"
                className="block text-xs font-semibold uppercase tracking-wide text-ink/55"
              >
                {t("advancedAuthor")}
              </label>
              <input
                id="pub-adv-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink"
              />
              <p className="mt-1 text-xs text-ink/50">{t("advancedAuthorHint")}</p>
            </div>

            <div>
              <label
                htmlFor="pub-adv-discipline"
                className="block text-xs font-semibold uppercase tracking-wide text-ink/55"
              >
                {t("discipline")}
              </label>
              <select
                id="pub-adv-discipline"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink"
              >
                <option value="">{t("disciplineAny")}</option>
                {DISCIPLINE_OPTIONS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="pub-adv-type"
                className="block text-xs font-semibold uppercase tracking-wide text-ink/55"
              >
                {t("articleType")}
              </label>
              <select
                id="pub-adv-type"
                value={articleType}
                onChange={(e) => setArticleType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink"
              >
                <option value="">{tWf("articleTypePlaceholder")}</option>
                {ARTICLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {tWf(`articleType_${type}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="pub-adv-from"
                className="block text-xs font-semibold uppercase tracking-wide text-ink/55"
              >
                {t("publishedFrom")}
              </label>
              <input
                id="pub-adv-from"
                type="date"
                value={publishedFrom}
                onChange={(e) => setPublishedFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>

            <div>
              <label
                htmlFor="pub-adv-to"
                className="block text-xs font-semibold uppercase tracking-wide text-ink/55"
              >
                {t("publishedTo")}
              </label>
              <input
                id="pub-adv-to"
                type="date"
                value={publishedTo}
                onChange={(e) => setPublishedTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
            >
              {t("apply")}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/75 transition hover:border-ink/25"
            >
              {t("clear")}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && resultCount !== null ? (
        <p className="text-sm text-ink/60" aria-live="polite">
          {t("resultCount", { count: resultCount })}
        </p>
      ) : null}
    </div>
  );
}
