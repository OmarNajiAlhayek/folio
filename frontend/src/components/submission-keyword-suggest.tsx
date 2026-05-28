"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { apiJson } from "@/lib/api";
import { ApiError } from "@/lib/api-response";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/ui/spinner";
import type { KeywordAddFailure } from "@/lib/keywords";

export type KeywordSuggestionResult = {
  keywordsEn: string[];
  keywordsAr: string[];
};

export type KeywordSuggestPreviewInput = {
  title?: string;
  abstract?: string;
  titleAr?: string;
  abstractAr?: string;
};

type Props = {
  canSuggest: boolean;
  suggestedEn: string[];
  suggestedAr: string[];
  onSuggestions: (result: KeywordSuggestionResult) => void;
  /** Existing draft — load metadata from the submission. */
  slug?: string;
  /** New-submission wizard — send title/abstract from the form body. */
  previewInput?: KeywordSuggestPreviewInput;
};

export function SubmissionKeywordSuggest({
  slug,
  previewInput,
  canSuggest,
  suggestedEn,
  suggestedAr,
  onSuggestions,
}: Props) {
  const t = useTranslations("SubmissionWorkflow");
  const { resolve: resolveApiError } = useApiErrorMessages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const suggest = useCallback(async () => {
    if (!slug && !previewInput) return;
    setBusy(true);
    setError("");
    try {
      const result = slug
        ? await apiJson<KeywordSuggestionResult>(
            `/submissions/${encodeURIComponent(slug)}/suggest-keywords`,
            { method: "POST" },
          )
        : await apiJson<KeywordSuggestionResult>(
            "/submissions/suggest-keywords-preview",
            {
              method: "POST",
              body: JSON.stringify(previewInput),
            },
          );
      onSuggestions(result);
      toast.success(t("keywordSuggestSuccess"), {
        id: "submission-keyword-suggest",
      });
    } catch (e) {
      const fallback =
        e instanceof ApiError && e.code === "AI_SERVICE_UNAVAILABLE"
          ? t("keywordSuggestNotConfigured")
          : t("keywordSuggestFailed");
      setError(resolveApiError(e, fallback));
    } finally {
      setBusy(false);
    }
  }, [slug, previewInput, onSuggestions, resolveApiError, t]);

  const hasSuggestions = suggestedEn.length > 0 || suggestedAr.length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink/10 bg-ink/[0.02] px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canSuggest || busy}
          onClick={() => void suggest()}
          className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-ink hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Spinner className="size-4" /> : null}
          {t("keywordSuggestAction")}
        </button>
        {!canSuggest && (
          <span className="text-xs text-ink/55">{t("keywordSuggestDisabledHint")}</span>
        )}
      </div>
      <p className="text-xs text-ink/60">{t("keywordSuggestHint")}</p>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {hasSuggestions ? (
        <p className="text-xs font-medium text-ink/70">{t("keywordSuggestResultsHint")}</p>
      ) : null}
    </div>
  );
}

export function KeywordSuggestionChips({
  suggestions,
  onAdd,
  onAddAll,
  addLabel,
  addAllLabel,
  dir,
  lang,
}: {
  suggestions: string[];
  onAdd: (keyword: string) => void;
  onAddAll: () => void;
  addLabel: string;
  addAllLabel: string;
  dir: "ltr" | "rtl";
  lang: string;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2" dir={dir} lang={lang}>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-surface px-2 py-0.5 text-xs text-ink"
          >
            <span>{kw}</span>
            <button
              type="button"
              onClick={() => onAdd(kw)}
              className="rounded px-1 font-medium text-accent hover:bg-accent/10"
            >
              {addLabel}
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onAddAll}
        className="self-start text-xs font-medium text-accent hover:underline"
      >
        {addAllLabel}
      </button>
    </div>
  );
}

const KEYWORD_ADD_TOAST_ID = "submission-keyword-add";

export function notifyKeywordAddFailure(
  failure: KeywordAddFailure | undefined,
  messages: {
    max: string;
    duplicate: string;
    tooLong: string;
    addAllNone: string;
  },
  toastId = KEYWORD_ADD_TOAST_ID,
) {
  if (!failure) {
    toast.info(messages.addAllNone, { id: toastId });
    return;
  }
  const text =
    failure === "max"
      ? messages.max
      : failure === "duplicate"
        ? messages.duplicate
        : messages.tooLong;
  toast.info(text, { id: toastId });
}

export {
  addAllSuggestedKeywords,
  addSuggestedKeyword,
  mergeKeywordTags,
} from "@/lib/keywords";
