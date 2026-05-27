"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { apiJson } from "@/lib/api";
import { ARABIC_DISCIPLINE_LABELS } from "@/lib/discipline-labels";
import type { DisciplineSuggestion, SubmissionDisciplineFields } from "@/lib/discipline-labels";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { Spinner } from "@/components/ui/spinner";

type Props = {
  slug: string;
  mode: "author" | "editor";
  fields: SubmissionDisciplineFields;
  canEdit: boolean;
  onUpdated: () => void;
};

export function SubmissionDisciplinePanel({
  slug,
  mode,
  fields,
  canEdit,
  onUpdated,
}: Props) {
  const t = useTranslations("SubmissionWorkflow");
  const { resolve: resolveApiError } = useApiErrorMessages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pick, setPick] = useState(fields.discipline ?? "");

  const enc = encodeURIComponent(slug);
  const showScopeWarning =
    fields.disciplineScopeWarning === "suggested_out_of_journal_scope" ||
    fields.disciplineScopeInJournal === false;

  const suggest = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await apiJson<DisciplineSuggestion>(
        `/submissions/${enc}/suggest-discipline`,
        { method: "POST" },
      );
      onUpdated();
    } catch (e) {
      setError(resolveApiError(e, t("disciplineSuggestFailed")));
    } finally {
      setBusy(false);
    }
  }, [enc, onUpdated, resolveApiError, t]);

  const applyDiscipline = useCallback(
    async (discipline: string) => {
      setBusy(true);
      setError("");
      try {
        await apiJson(`/submissions/${enc}/discipline`, {
          method: "PATCH",
          body: JSON.stringify({ discipline }),
        });
        setPick(discipline);
        onUpdated();
      } catch (e) {
        setError(resolveApiError(e, t("disciplineSaveFailed")));
      } finally {
        setBusy(false);
      }
    },
    [enc, onUpdated, resolveApiError, t],
  );

  const acceptSuggestion = () => {
    const label = fields.disciplineSuggested;
    if (label) void applyDiscipline(label);
  };

  return (
    <div className="rounded-lg border border-ink/10 bg-paper/30 px-4 py-4">
      <h4 className="text-sm font-semibold text-ink">{t("disciplineSection")}</h4>
      <p className="mt-1 text-xs leading-relaxed text-ink/60">
        {mode === "author" ? t("disciplineAuthorHint") : t("disciplineEditorHint")}
      </p>

      {fields.disciplineSuggested && (
        <div className="mt-3 rounded-md border border-ink/10 bg-surface px-3 py-2 text-sm" dir="auto">
          <p className="font-medium text-ink">{t("disciplineAiSuggestion")}</p>
          <p className="mt-1 text-ink/85">
            {fields.disciplineSuggested}
            {fields.disciplineSuggestedConfidence != null && (
              <span className="ms-2 text-ink/55">
                ({fields.disciplineSuggestedConfidence.toFixed(1)}%)
              </span>
            )}
          </p>
          {showScopeWarning && (
            <p className="mt-2 text-xs font-medium text-amber-900">
              {t("disciplineScopeWarning")}
            </p>
          )}
        </div>
      )}

      {fields.discipline && (
        <p className="mt-3 text-sm text-ink/80" dir="auto">
          <span className="font-medium text-ink">{t("disciplineConfirmed")}: </span>
          {fields.discipline}
          {fields.disciplineSource && (
            <span className="ms-2 text-xs text-ink/50">
              ({t(`disciplineSource_${fields.disciplineSource}`)})
            </span>
          )}
        </p>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-col gap-3">
          {mode === "author" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void suggest()}
              className="w-fit rounded-md border border-ink/15 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-paper disabled:opacity-60"
            >
              {busy ? (
                <Spinner size="sm" className="border-ink/30 border-t-ink" />
              ) : (
                t("disciplineSuggestAction")
              )}
            </button>
          )}

          {mode === "author" &&
            fields.disciplineSuggested &&
            fields.disciplineSuggested !== fields.discipline && (
              <button
                type="button"
                disabled={busy}
                onClick={() => acceptSuggestion()}
                className="w-fit rounded-md bg-accent/15 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-60"
              >
                {t("disciplineAcceptSuggestion")}
              </button>
            )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">{t("disciplineSelectLabel")}</span>
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              dir="auto"
              className="rounded-md border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            >
              <option value="">{t("disciplineSelectPlaceholder")}</option>
              {ARABIC_DISCIPLINE_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !pick}
            onClick={() => void applyDiscipline(pick)}
            className="w-fit rounded-md bg-ink px-3 py-2 text-sm font-medium text-paper disabled:opacity-60"
          >
            {t("disciplineConfirmAction")}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
