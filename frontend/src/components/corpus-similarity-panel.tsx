"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { Link } from "@/i18n/navigation";
import { apiJson } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

export type CorpusSimilarityReport =
  | { status: "unavailable" }
  | { status: "no_text" }
  | {
      status: "ok";
      threshold: number;
      matchCount: number;
      sources: Array<{
        articleId: string;
        maxSimilarity: number;
        snippets: Array<{
          submissionSnippet: string;
          matchedSnippet: string;
          similarity: number;
        }>;
        publication?: { slug: string; title: string; titleAr: string | null };
        indexedOnly?: boolean;
      }>;
    };

type Props = {
  slug: string;
};

export function CorpusSimilarityPanel({ slug }: Props) {
  const t = useTranslations("SubmissionDetail");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CorpusSimilarityReport | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<CorpusSimilarityReport>(
        `/submissions/${encodeURIComponent(slug)}/corpus-similarity`,
      );
      setReport(data);
    } catch {
      setError(t("corpusSimilarityLoadFailed"));
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
    <div className="rounded-lg border border-ink/10 bg-paper/30 px-4 py-4 dark:border-white/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-start"
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-ink">
          {t("corpusSimilarityTitle")}
        </span>
        <span className="text-xs text-ink/50">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-relaxed text-ink/60">
            {t("corpusSimilarityDisclaimer")}
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-ink/60">
              <Spinner className="size-4" />
              {t("corpusSimilarityLoading")}
            </div>
          )}

          {error && <p className="text-sm text-red-700">{error}</p>}

          {!loading && !error && report?.status === "unavailable" && (
            <p className="text-sm text-ink/65">{t("corpusSimilarityUnavailable")}</p>
          )}

          {!loading && !error && report?.status === "no_text" && (
            <p className="text-sm text-ink/65">{t("corpusSimilarityNoText")}</p>
          )}

          {!loading && !error && report?.status === "ok" && report.sources.length === 0 && (
            <p className="text-sm text-ink/65">{t("corpusSimilarityClear")}</p>
          )}

          {!loading && !error && report?.status === "ok" && report.sources.length > 0 && (
            <ul className="space-y-4">
              {report.sources.map((src) => {
                const title =
                  locale === "ar" && src.publication?.titleAr
                    ? src.publication.titleAr
                    : src.publication?.title;
                return (
                  <li
                    key={src.articleId}
                    className="rounded-md border border-ink/10 bg-surface/80 p-3 dark:border-white/10"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      {src.publication?.slug ? (
                        <Link
                          href={`/publications/${src.publication.slug}`}
                          className="text-sm font-semibold text-accent hover:underline"
                        >
                          {title ?? src.publication.slug}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-ink">
                          {src.indexedOnly
                            ? t("corpusSimilarityIndexedOnly")
                            : src.articleId}
                        </span>
                      )}
                      <span className="text-xs font-mono text-ink/55">
                        {t("corpusSimilarityMax", { percent: pct(src.maxSimilarity) })}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-2">
                      {src.snippets.map((sn, i) => (
                        <li key={i} className="text-xs text-ink/70">
                          <p dir="auto" className="line-clamp-2">
                            <span className="font-medium text-ink/50">
                              {t("corpusSimilaritySubmissionBit")}:{" "}
                            </span>
                            {sn.submissionSnippet}
                          </p>
                          <p dir="auto" className="mt-1 line-clamp-2">
                            <span className="font-medium text-ink/50">
                              {t("corpusSimilarityCorpusBit")}:{" "}
                            </span>
                            {sn.matchedSnippet}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
