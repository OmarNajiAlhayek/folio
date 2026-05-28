"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import {
  addSuggestedKeyword,
  type KeywordAddFailure,
} from "@/lib/keywords";

const DEFAULT_MAX_TAGS = 6;
const DEFAULT_MAX_SERIALIZED = 800;

export function KeywordTagsInput({
  tags,
  onChange,
  placeholder,
  id,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  disabled,
  maxTags = DEFAULT_MAX_TAGS,
  maxSerializedLength = DEFAULT_MAX_SERIALIZED,
  locale = "en",
  onCommitFailure,
  inputValue,
  onInputChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  id?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
  maxTags?: number;
  maxSerializedLength?: number;
  locale?: "en" | "ar";
  onCommitFailure?: (failure: KeywordAddFailure) => void;
  inputValue: string;
  onInputChange: (v: string) => void;
}) {
  const t = useTranslations("SubmissionWorkflow");
  const inputRef = useRef<HTMLInputElement>(null);

  const tryCommitDraft = useCallback(
    (draft: string) => {
      const trimmed = draft.trim();
      if (!trimmed) return;
      const result = addSuggestedKeyword(
        tags,
        trimmed,
        locale,
        maxTags,
        maxSerializedLength,
      );
      if (result.addedCount > 0) {
        onChange(result.tags);
        onInputChange("");
        return;
      }
      onInputChange("");
      if (result.failure) onCommitFailure?.(result.failure);
    },
    [
      tags,
      locale,
      maxTags,
      maxSerializedLength,
      onChange,
      onInputChange,
      onCommitFailure,
    ],
  );

  function removeAt(index: number) {
    onChange(tags.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      tryCommitDraft(inputValue);
      return;
    }

    if (e.key === "Tab" && inputValue.trim() !== "") {
      e.preventDefault();
      tryCommitDraft(inputValue);
      return;
    }

    if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div
      className={`rounded-md border border-ink/15 bg-surface px-2 py-1 outline-none transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/25 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
      onClick={() => {
        if (!disabled) inputRef.current?.focus();
      }}
    >
      {tags.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {tags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="inline-flex max-w-full items-center gap-px rounded border border-accent/35 bg-accent/12 px-1.5 py-px text-xs leading-tight text-ink sm:text-[13px]"
            >
              <span className="truncate">{tag}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={(ev) => {
                  ev.stopPropagation();
                  removeAt(index);
                }}
                className="shrink-0 rounded p-px text-accent/80 outline-none hover:bg-accent/20 hover:text-accent focus-visible:ring-1 focus-visible:ring-accent/40"
                aria-label={t("keywordsRemoveTag", { keyword: tag })}
              >
                <span aria-hidden className="block text-sm leading-none">
                  ×
                </span>
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        disabled={disabled}
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={tags.length === 0 ? placeholder : undefined}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className="h-7 w-full min-w-0 border-0 bg-transparent py-0 text-sm leading-7 text-ink outline-none placeholder:text-ink/35 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/** Read-only chip row; matches editor styling. */
export function KeywordTagsDisplay({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex max-w-full items-center rounded border border-accent/35 bg-accent/12 px-1.5 py-px text-xs leading-tight text-ink sm:text-[13px]"
        >
          <span className="truncate">{tag}</span>
        </span>
      ))}
    </span>
  );
}
