"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ValidationBanner } from "./ValidationBanner";
import {
  SectionEditor,
  createBlankSection,
} from "./SectionEditors";
import { estimateWeightedWordCount } from "@/lib/constructor-direction";
import type {
  ConstructorContent,
  ConstructorDir,
  ConstructorSection,
  ConstructorSectionKind,
  ConstructorValidationError,
  TitleSection,
} from "@/lib/constructor-content.types";

interface SectionListProps {
  content: ConstructorContent;
  onChange: (next: ConstructorContent) => void;
  errors: ConstructorValidationError[];
  /** Submission slug (only present after first save) — needed for image uploads. */
  slug?: string;
  readOnly?: boolean;
  /** When true, renders the post-submit error banner instead of the soft warning. */
  errorsAreBlocking?: boolean;
}

const ADDABLE_KINDS: ConstructorSectionKind[] = [
  "title",
  "authors",
  "abstract",
  "heading1",
  "heading2",
  "heading3",
  "paragraph",
  "image",
  "table",
  "references",
];

/**
 * Vertical list of section editor cards with reorder + add + remove controls,
 * a soft word-count badge (warns when the weighted estimate suggests >25
 * pages), and a pinned ValidationBanner at the top.
 *
 * Section ORDER is intentionally unenforced (per plan): authors should be
 * able to choose their structure freely, and the banner only checks for
 * presence, not position.
 */
export function SectionList({
  content,
  onChange,
  errors,
  slug,
  readOnly,
  errorsAreBlocking,
}: SectionListProps) {
  const t = useTranslations("ConstructorList");
  const [addPickerOpen, setAddPickerOpen] = useState(false);

  const wordEstimate = useMemo(
    () => estimateWeightedWordCount(content),
    [content],
  );
  // Style.md soft cap: 25 pages × ~300 words/page (single-spaced, mixed body
  // + figures/tables) ≈ 7500. The helper sets `warn` past that mark.
  const PAGE_LIMIT_WORDS = 7500;

  // Split errors: doc-level ones (no sectionId) go to the banner; section-
  // specific ones (with sectionId) render inline under their card.
  const docErrors = useMemo(
    () => errors.filter((e) => !e.sectionId),
    [errors],
  );
  const sectionErrorMap = useMemo(() => {
    const map = new Map<string, ConstructorValidationError[]>();
    for (const e of errors) {
      if (e.sectionId) {
        const list = map.get(e.sectionId) ?? [];
        list.push(e);
        map.set(e.sectionId, list);
      }
    }
    return map;
  }, [errors]);

  function updateSection(idx: number, next: ConstructorSection) {
    const sections = content.sections.slice();
    sections[idx] = next;
    onChange({ ...content, sections });
  }

  function removeSection(idx: number) {
    onChange({
      ...content,
      sections: content.sections.filter((_, i) => i !== idx),
    });
  }

  function move(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= content.sections.length) return;
    const sections = content.sections.slice();
    const tmp = sections[idx];
    sections[idx] = sections[target];
    sections[target] = tmp;
    onChange({ ...content, sections });
  }

  function addSection(kind: ConstructorSectionKind) {
    const fresh = createBlankSection(kind, content.defaultDir);
    onChange({
      ...content,
      sections: [...content.sections, fresh],
    });
    setAddPickerOpen(false);
  }

  function setDefaultDir(dir: ConstructorDir) {
    onChange({ ...content, defaultDir: dir });
  }

  function jumpToSection(sectionId: string) {
    const el = document.getElementById(`constructor-section-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = el.querySelector<HTMLElement>(
        "input, textarea, [contenteditable=true]",
      );
      focusable?.focus();
    }
  }

  return (
    <div className="space-y-4">
      {/* Doc-level controls: default direction + word count badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper/40 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-ink/70">
            {t("defaultDirLabel")}
          </span>
          <div role="group" className="flex overflow-hidden rounded border border-ink/15">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setDefaultDir("ltr")}
              className={`px-3 py-1 text-xs ${
                content.defaultDir === "ltr"
                  ? "bg-accent/15 text-accent"
                  : "bg-paper text-ink/70 hover:bg-paper/80"
              }`}
            >
              {t("dirLtr")}
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setDefaultDir("rtl")}
              className={`px-3 py-1 text-xs ${
                content.defaultDir === "rtl"
                  ? "bg-accent/15 text-accent"
                  : "bg-paper text-ink/70 hover:bg-paper/80"
              }`}
            >
              {t("dirRtl")}
            </button>
          </div>
        </div>
        <div className="text-xs">
          <span
            className={`rounded-full px-2 py-1 font-medium ${
              wordEstimate.warn
                ? "bg-amber-100/80 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                : "bg-ink/5 text-ink/65"
            }`}
            title={t("wordCountTitle", { limit: PAGE_LIMIT_WORDS })}
          >
            {t("wordCountBadge", {
              count: wordEstimate.weighted,
              limit: PAGE_LIMIT_WORDS,
            })}
          </span>
        </div>
      </div>

      <ValidationBanner
        errors={docErrors}
        onJump={jumpToSection}
        severity={errorsAreBlocking ? "error" : "warning"}
      />

      <ul className="space-y-3">
        {content.sections.map((section, idx) => (
          <li
            key={section.id}
            id={`constructor-section-${section.id}`}
            className="rounded-lg border border-ink/10 bg-surface p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
                {section.kind === "title" && (section as TitleSection).lang
                  ? t(`kind_title_${(section as TitleSection).lang}` as const)
                  : t(`kind_${section.kind}` as const)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={readOnly || idx === 0}
                  onClick={() => move(idx, -1)}
                  className="rounded border border-ink/15 bg-paper px-2 py-1 text-xs hover:border-accent/40 disabled:opacity-30"
                  aria-label={t("moveUp")}
                  title={t("moveUp")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={
                    readOnly || idx === content.sections.length - 1
                  }
                  onClick={() => move(idx, 1)}
                  className="rounded border border-ink/15 bg-paper px-2 py-1 text-xs hover:border-accent/40 disabled:opacity-30"
                  aria-label={t("moveDown")}
                  title={t("moveDown")}
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={readOnly || !!section.pinned}
                  onClick={() => removeSection(idx)}
                  className="rounded border border-red-300/70 bg-red-100/75 px-2 py-1 text-xs text-red-800 hover:bg-red-200/80 dark:border-red-500/35 dark:bg-red-500/12 dark:text-red-200 dark:hover:bg-red-500/18 disabled:opacity-50"
                  aria-label={t("remove")}
                  title={t("remove")}
                >
                  ×
                </button>
              </div>
            </div>
            <SectionEditor
              section={section}
              defaultDir={content.defaultDir}
              onChange={(next) => updateSection(idx, next)}
              slug={slug}
              readOnly={readOnly}
            />
            {(() => {
              const errs = sectionErrorMap.get(section.id);
              if (!errs?.length) return null;
              return (
                <ul className="mt-2 space-y-1 ps-1">
                  {errs.map((e, i) => (
                    <li
                      key={i}
                      className={`text-xs font-medium ${errorsAreBlocking ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}
                    >
                      {e.message}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </li>
        ))}
      </ul>

      {!readOnly && (
        <div className="rounded-lg border border-dashed border-ink/20 bg-paper/30 p-4">
          {addPickerOpen ? (
            <>
              <p className="mb-3 text-sm font-medium text-ink/75">
                {t("addPickerTitle")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ADDABLE_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addSection(kind)}
                    className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-start text-sm font-medium text-ink hover:border-accent/40"
                  >
                    {t(`kind_${kind}` as const)}
                  </button>
                ))}
              </div>
              <div className="mt-3 text-end">
                <button
                  type="button"
                  onClick={() => setAddPickerOpen(false)}
                  className="text-xs text-ink/65 hover:underline"
                >
                  {t("cancel")}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAddPickerOpen(true)}
              className="w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm font-medium text-ink hover:border-accent/40"
            >
              {t("addSection")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
