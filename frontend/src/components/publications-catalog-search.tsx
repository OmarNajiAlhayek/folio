"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ARABIC_DISCIPLINE_LABELS } from "@/lib/discipline-labels";
import type { SubmissionArticleType } from "@/lib/queries/submissions";
import type {
  PublicationCatalogFilters,
  PublicationSearchMode,
} from "@/lib/public-submissions-query";
import { PublicationAuthorTypeahead } from "@/components/publication-author-typeahead";
import { SimpleSelect } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";

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
  onSearchModeChange: (mode: PublicationSearchMode) => void;
  onApplyAdvanced: (draft: PublicationCatalogFilters) => void;
  onClear: () => void;
  resultCount: number | null;
  loading: boolean;
};

export function PublicationsCatalogSearch({
  filters,
  onQuickQueryChange,
  onSearchModeChange,
  onApplyAdvanced,
  onClear,
  resultCount,
  loading,
}: Props) {
  const t = useTranslations("Publications");
  const tWf = useTranslations("SubmissionWorkflow");
  const locale = useLocale();
  const [quickQ, setQuickQ] = useState(filters.q ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [author, setAuthor] = useState(filters.author ?? "");
  const [discipline, setDiscipline] = useState(filters.discipline ?? "");
  const [articleType, setArticleType] = useState(filters.articleType ?? "");
  const [publishedFrom, setPublishedFrom] = useState(
    filters.publishedFrom ?? "",
  );
  const [publishedTo, setPublishedTo] = useState(filters.publishedTo ?? "");
  const searchMode: PublicationSearchMode = filters.searchMode ?? "keyword";

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
      searchMode: filters.searchMode,
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

  const disciplineOptions = [
    { value: "", label: t("disciplineAny") },
    ...DISCIPLINE_OPTIONS.map((label) => ({ value: label, label })),
  ];

  const articleTypeOptions = [
    { value: "", label: tWf("articleTypePlaceholder") },
    ...ARTICLE_TYPES.map((type) => ({
      value: type,
      label: tWf(`articleType_${type}`),
    })),
  ];

  return (
    <div className="mt-8 space-y-4">
      {/* Search mode + quick search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div
          className="flex shrink-0 rounded-xl border border-ink/15 dark:border-white/15 bg-surface/80 p-1"
          role="radiogroup"
          aria-label={t("searchModeLabel")}
        >
          {(["keyword", "semantic"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={searchMode === mode}
              onClick={() => onSearchModeChange(mode)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                searchMode === mode
                  ? "bg-accent text-white shadow-xs"
                  : "text-ink/70 hover:text-ink hover:bg-ink/5"
              }`}
            >
              {mode === "keyword" ? t("searchModeText") : t("searchModeSemantic")}
            </button>
          ))}
        </div>
        <div className="relative flex-1 flex items-center">
          <label className="sr-only" htmlFor="pub-catalog-q">
            {t("searchPlaceholder")}
          </label>
          <div className="absolute start-3 pointer-events-none text-ink/35 z-10" aria-hidden>
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
            </svg>
          </div>
          <input
            id="pub-catalog-q"
            type="search"
            value={quickQ}
            onChange={(e) => setQuickQ(e.target.value)}
            placeholder={
              searchMode === "semantic"
                ? t("searchPlaceholderSemantic")
                : t("searchPlaceholder")
            }
            className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-surface/90 ps-9 pe-4 py-2.5 text-sm text-ink outline-hidden transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            autoComplete="off"
          />
        </div>
        
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className={`shrink-0 flex items-center justify-center gap-1.5 rounded-xl border border-ink/15 dark:border-white/15 bg-surface/80 px-5 py-2.5 text-sm font-semibold text-ink/80 transition-all duration-300 hover:border-ink/25 hover:text-ink active:scale-[0.98] ${
            advancedOpen ? "bg-accent/8 border-accent/20 text-accent hover:border-accent/35" : ""
          }`}
          aria-expanded={advancedOpen}
        >
          {t("advancedSearch")}
          <span className={`inline-block text-[10px] transform transition-transform duration-300 ${advancedOpen ? "rotate-180 text-accent" : "text-ink/40"}`}>
            ▼
          </span>
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {advancedOpen && (
        <div className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/95 p-5 shadow-md backdrop-blur-md transition-all duration-300">
          
          <div className="grid gap-4 sm:grid-cols-2">
            
            {/* Author Name */}
            <div className="sm:col-span-2">
              <label
                htmlFor="pub-adv-author"
                className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
              >
                {t("advancedAuthor")}
              </label>
              <div className="relative mt-1.5">
                <div className="absolute start-3 top-1/2 z-10 -translate-y-1/2 pointer-events-none text-ink/35" aria-hidden>
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <PublicationAuthorTypeahead
                  id="pub-adv-author"
                  value={author}
                  onChange={setAuthor}
                  className="w-full"
                  inputClassName="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 ps-9 pe-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
              </div>
              <p className="mt-1 text-[10px] text-ink/50 leading-tight">{t("advancedAuthorHint")}</p>
            </div>

            {/* Academic Discipline */}
            <div>
              <label
                htmlFor="pub-adv-discipline"
                className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
              >
                {t("discipline")}
              </label>
              <div className="relative flex items-center mt-1.5 w-full">
                <div className="absolute start-3 pointer-events-none text-ink/35 z-10" aria-hidden>
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                  </svg>
                </div>
                <SearchableSelect
                  options={disciplineOptions}
                  value={discipline}
                  onValueChange={setDiscipline}
                  placeholder={t("disciplineAny")}
                  searchPlaceholder={locale === "ar" ? "ابحث عن التخصص..." : "Search disciplines..."}
                  emptyText={locale === "ar" ? "لم يتم العثور على تخصصات" : "No disciplines found"}
                  className="ps-9 w-full text-start"
                />
              </div>
            </div>

            {/* Article Type */}
            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
              >
                {t("articleType")}
              </label>
              <div className="relative flex items-center mt-1.5 w-full">
                <div className="absolute start-3 pointer-events-none text-ink/35 z-10" aria-hidden>
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <SimpleSelect
                  value={articleType}
                  onValueChange={setArticleType}
                  placeholder={tWf("articleTypePlaceholder")}
                  className="ps-9 w-full text-start"
                  options={articleTypeOptions}
                />
              </div>
            </div>

            {/* Published From Date */}
            <div>
              <label
                htmlFor="pub-adv-from"
                className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
              >
                {t("publishedFrom")}
              </label>
              <div className="relative flex items-center mt-1.5">
                <div className="absolute start-3 pointer-events-none text-ink/35" aria-hidden>
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                  </svg>
                </div>
                <input
                  id="pub-adv-from"
                  type="date"
                  value={publishedFrom}
                  onChange={(e) => setPublishedFrom(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 ps-9 pe-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
              </div>
            </div>

            {/* Published To Date */}
            <div>
              <label
                htmlFor="pub-adv-to"
                className="block text-[11px] font-bold uppercase tracking-wider text-ink/45"
              >
                {t("publishedTo")}
              </label>
              <div className="relative flex items-center mt-1.5">
                <div className="absolute start-3 pointer-events-none text-ink/35" aria-hidden>
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                  </svg>
                </div>
                <input
                  id="pub-adv-to"
                  type="date"
                  value={publishedTo}
                  onChange={(e) => setPublishedTo(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/50 ps-9 pe-3 py-2 text-sm text-ink outline-hidden focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
              </div>
            </div>

          </div>

          {/* Action triggers */}
          <div className="mt-5 flex flex-wrap gap-2 pt-4 border-t border-ink/[0.06] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={handleApply}
              className="rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition-all duration-200"
            >
              {t("apply")}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-xl border border-ink/15 dark:border-white/15 px-5 py-2.5 text-xs font-semibold text-ink/75 hover:bg-ink/5 active:scale-[0.98] transition-all duration-200"
            >
              {t("clear")}
            </button>
          </div>

        </div>
      )}

      {/* Query count indicator */}
      {!loading && resultCount !== null ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-ink/55 bg-ink/[0.03] dark:bg-white/[0.03] border border-ink/[0.05] max-w-fit px-3.5 py-1 rounded-full">
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inset-0 rounded-full bg-accent opacity-75 animate-ping" />
            <span className="relative rounded-full size-1.5 bg-accent" />
          </span>
          {t("resultCount", { count: resultCount })}
        </div>
      ) : null}
    </div>
  );
}
