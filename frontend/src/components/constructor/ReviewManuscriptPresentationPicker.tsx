"use client";

import { useTranslations } from "next-intl";
import type { ReviewManuscriptPresentation } from "@/lib/review-manuscript-presentation";

type ReviewManuscriptPresentationPickerProps = {
  value: ReviewManuscriptPresentation;
  onChange: (next: ReviewManuscriptPresentation) => void;
  hasUploadedManuscript: boolean;
  hasConstructorDraft: boolean;
  disabled?: boolean;
};

export function ReviewManuscriptPresentationPicker({
  value,
  onChange,
  hasUploadedManuscript,
  hasConstructorDraft,
  disabled = false,
}: ReviewManuscriptPresentationPickerProps) {
  const t = useTranslations("ConstructorManuscript");

  function toggleUploaded(checked: boolean) {
    onChange({ ...value, presentUploaded: checked });
  }

  function toggleConstructor(checked: boolean) {
    onChange({ ...value, presentConstructor: checked });
  }

  const noneSelected = !value.presentUploaded && !value.presentConstructor;

  const checkboxCls =
    "mt-0.5 size-4 shrink-0 cursor-pointer rounded border-ink/25 accent-accent focus:ring-2 focus:ring-accent/40 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <fieldset
      className="rounded-lg border border-ink/10 bg-paper/40 px-4 py-3"
      data-testid="review-manuscript-presentation-picker"
      disabled={disabled}
    >
      <legend className="text-sm font-medium text-ink">
        {t("presentationLegend")}
      </legend>
      <p className="mt-1 text-xs text-ink/55">{t("presentationHint")}</p>
      <div className="mt-3 flex flex-col gap-2">
        <label
          className={`flex items-start gap-2 text-sm text-ink ${
            hasUploadedManuscript ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
        >
          <input
            type="checkbox"
            checked={value.presentUploaded}
            disabled={disabled || !hasUploadedManuscript}
            onChange={(e) => toggleUploaded(e.target.checked)}
            data-testid="presentation-upload"
            className={checkboxCls}
          />
          <span>{t("presentationUpload")}</span>
        </label>
        <label
          className={`flex items-start gap-2 text-sm text-ink ${
            hasConstructorDraft ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
        >
          <input
            type="checkbox"
            checked={value.presentConstructor}
            disabled={disabled || !hasConstructorDraft}
            onChange={(e) => toggleConstructor(e.target.checked)}
            data-testid="presentation-constructor"
            className={checkboxCls}
          />
          <span>{t("presentationConstructor")}</span>
        </label>
      </div>
      {noneSelected ? (
        <p
          className="mt-2 text-xs text-red-700"
          role="alert"
          data-testid="presentation-none-selected"
        >
          {t("presentationAtLeastOne")}
        </p>
      ) : null}
    </fieldset>
  );
}
