"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { apiJson } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

export type SuggestedReviewersReport =
  | { status: "unavailable" }
  | { status: "no_text" }
  | { status: "no_candidates" }
  | {
      status: "ok";
      suggestions: Array<{
        reviewerId: string;
        displayName: string;
        email: string;
        finalScore: number;
        bioScore: number;
        historyScore: number;
        ceBioScore?: number;
        ceHistoryScore?: number;
        usedCrossEncoder: boolean;
      }>;
    };

type Props = {
  slug: string;
  disabled?: boolean;
  onPick: (reviewerId: string) => void;
};

export function ReviewerSuggestionsPanel({ slug, disabled, onPick }: Props) {
  const t = useTranslations("SubmissionDetail");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SuggestedReviewersReport | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<SuggestedReviewersReport>(
        `/submissions/${encodeURIComponent(slug)}/suggested-reviewers`,
      );
      setReport(data);
    } catch {
      setError(t("suggestReviewersLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  const onToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && report === null && !loading) {
      void load();
    }
  };

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/20 px-3 py-3 dark:border-white/10">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 text-start disabled:opacity-50"
        aria-expanded={expanded}
      >
        <span className="text-[11px] font-semibold text-ink/70">
          {t("suggestReviewersTitle")}
        </span>
        <span className="text-xs text-ink/50">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] text-ink/50">{t("suggestReviewersHint")}</p>
          {loading && (
            <div className="flex items-center gap-2 text-[10px] text-ink/60">
              <Spinner className="h-3 w-3" />
              {t("suggestReviewersLoading")}
            </div>
          )}
          {error && <p className="text-[10px] text-red-600">{error}</p>}
          {report?.status === "unavailable" && (
            <p className="text-[10px] text-ink/50">
              {t("suggestReviewersUnavailable")}
            </p>
          )}
          {report?.status === "no_text" && (
            <p className="text-[10px] text-ink/50">{t("suggestReviewersNoText")}</p>
          )}
          {report?.status === "no_candidates" && (
            <p className="text-[10px] text-ink/50">
              {t("noReviewersAvailable")}
            </p>
          )}
          {report?.status === "ok" && report.suggestions.length === 0 && (
            <p className="text-[10px] text-ink/50">{t("suggestReviewersEmpty")}</p>
          )}
          {report?.status === "ok" && report.suggestions.length > 0 && (
            <ul className="space-y-2">
              {report.suggestions.map((row) => (
                <li
                  key={row.reviewerId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink/10 bg-paper/60 px-2 py-2 dark:border-white/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">
                      {row.displayName}
                    </p>
                    <p className="truncate text-[10px] text-ink/50">{row.email}</p>
                    <p className="text-[10px] text-ink/60">
                      {t("suggestReviewersMatchScore", {
                        percent: pct(row.finalScore),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(row.reviewerId)}
                    className="shrink-0 rounded-lg border border-ink/15 px-2 py-1 text-[10px] font-semibold text-ink hover:bg-ink/5 disabled:opacity-50 dark:border-white/15"
                  >
                    {t("suggestReviewersUse")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
