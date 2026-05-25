"use client";



import { useMemo, useState, type ReactNode } from "react";

import { useTranslations } from "next-intl";

import { ValidationBanner } from "./ValidationBanner";

import {

  SectionEditor,

  createBlankSection,

} from "./SectionEditors";

import { estimateWeightedWordCount } from "@/lib/constructor-direction";

import {

  buildPresetSections,

  presetHeadingKey,

  presetsForArticleType,

  type ConstructorPresetId,

  type SubmissionArticleType,

} from "@/lib/constructor-section-presets";

import type { ConstructorGuidance } from "@/lib/constructor-content.types";

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

  slug?: string;

  readOnly?: boolean;

  errorsAreBlocking?: boolean;

  articleType?: SubmissionArticleType | null;

  guidance?: ConstructorGuidance | null;

  onInsertPreset?: (presetId: ConstructorPresetId) => void;

}



type AddableKind =

  | "heading1"

  | "heading2"

  | "heading3"

  | "paragraph"

  | "image"

  | "table"

  | "acknowledgments"

  | "funding"

  | "conflictOfInterest"

  | "dataAvailability"

  | "equation";



const HEADING_BODY_KINDS: AddableKind[] = [

  "heading1",

  "heading2",

  "heading3",

  "paragraph",

];



const MEDIA_KINDS: AddableKind[] = ["image", "table", "equation"];



const BACK_MATTER_KINDS: AddableKind[] = [

  "acknowledgments",

  "funding",

  "conflictOfInterest",

  "dataAvailability",

];



export function SectionList({

  content,

  onChange,

  errors,

  slug,

  readOnly,

  errorsAreBlocking,

  articleType = null,

  guidance,

  onInsertPreset,

}: SectionListProps) {

  const t = useTranslations("ConstructorList");

  const [addPickerOpen, setAddPickerOpen] = useState(false);



  const wordEstimate = useMemo(

    () => estimateWeightedWordCount(content),

    [content],

  );

  const PAGE_LIMIT_WORDS = 7500;



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



  const presetIds = useMemo(

    () => presetsForArticleType(articleType),

    [articleType],

  );



  const recommendedMissing = useMemo(() => {

    const recommended = guidance?.recommendedPresets ?? [];

    return recommended.filter(

      (id) => !content.sections.some((s) => s.presetSourceId === id),

    );

  }, [content.sections, guidance?.recommendedPresets]);



  const refsIdx = content.sections.findIndex((s) => s.kind === "references");

  const orderSoftWarning =

    refsIdx >= 0 &&

    content.sections.slice(refsIdx + 1).some((s) => !s.pinned);



  function updateSection(idx: number, next: ConstructorSection) {

    const sections = content.sections.slice();

    sections[idx] = next;

    onChange({ ...content, sections });

  }



  function removeSection(idx: number) {

    if (content.sections[idx]?.pinned) return;

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



  function appendSections(sectionsToAdd: ConstructorSection[]) {

    onChange({

      ...content,

      sections: [...content.sections, ...sectionsToAdd],

    });

    setAddPickerOpen(false);

  }



  function addSection(kind: AddableKind) {

    const fresh = createBlankSection(

      kind as ConstructorSectionKind,

      content.defaultDir,

    );

    appendSections([fresh]);

  }



  function insertPreset(id: ConstructorPresetId) {

    const headingText = t(presetHeadingKey(id));

    appendSections(buildPresetSections(id, headingText, content.defaultDir));

    onInsertPreset?.(id);

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



  const docErrorsWithSoft = useMemo(() => {

    const extra: ConstructorValidationError[] = [];

    if (orderSoftWarning) {

      extra.push({

        code: "CONSTRUCTOR_REFERENCES_ORDER_SOFT",

        message: t("referencesOrderSoft"),

      });

    }

    return [...docErrors, ...extra];

  }, [docErrors, orderSoftWarning, t]);



  return (

    <div className="space-y-4">

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



      {recommendedMissing.length > 0 && !readOnly ? (

        <div

          className="rounded-md border border-amber-300/70 bg-amber-100/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-200"

          data-testid="constructor-recommended-presets"

        >

          <p className="font-medium">{t("recommendedPresetsTitle")}</p>

          <ul className="mt-2 flex flex-wrap gap-2">

            {recommendedMissing.map((id) => (

              <li key={id}>

                <button

                  type="button"

                  onClick={() => insertPreset(id)}

                  className="rounded border border-amber-400/60 bg-paper px-2 py-1 text-xs font-medium hover:border-accent/40"

                >

                  {t("insertPreset", { label: t(presetHeadingKey(id)) })}

                </button>

              </li>

            ))}

          </ul>

        </div>

      ) : null}



      <ValidationBanner

        errors={docErrorsWithSoft}

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

              equationNumber={

                section.kind === "equation"

                  ? content.sections

                      .slice(0, idx + 1)

                      .filter((s) => s.kind === "equation").length

                  : undefined

              }

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

              <div className="space-y-4">

                <PickerGroup

                  title={t("pickerGroup_presets")}

                  buttons={presetIds.map((id) => (

                    <button

                      key={id}

                      type="button"

                      data-testid={`constructor-add-preset-${id}`}

                      onClick={() => insertPreset(id)}

                      className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-start text-sm font-medium text-ink hover:border-accent/40"

                    >

                      {t(presetHeadingKey(id))}

                    </button>

                  ))}

                />

                <PickerGroup

                  title={t("pickerGroup_headingsBody")}

                  buttons={HEADING_BODY_KINDS.map((kind) => (

                    <button

                      key={kind}

                      type="button"

                      data-testid={`constructor-add-kind-${kind}`}

                      onClick={() => addSection(kind)}

                      className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-start text-sm font-medium text-ink hover:border-accent/40"

                    >

                      {t(`kind_${kind}` as const)}

                    </button>

                  ))}

                />

                <PickerGroup

                  title={t("pickerGroup_media")}

                  buttons={MEDIA_KINDS.map((kind) => (

                    <button

                      key={kind}

                      type="button"

                      data-testid={`constructor-add-kind-${kind}`}

                      onClick={() => addSection(kind)}

                      className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-start text-sm font-medium text-ink hover:border-accent/40"

                    >

                      {t(`kind_${kind}` as const)}

                    </button>

                  ))}

                />

                <PickerGroup

                  title={t("pickerGroup_backMatter")}

                  buttons={BACK_MATTER_KINDS.map((kind) => (

                    <button

                      key={kind}

                      type="button"

                      onClick={() => addSection(kind)}

                      className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-start text-sm font-medium text-ink hover:border-accent/40"

                    >

                      {t(`kind_${kind}` as const)}

                    </button>

                  ))}

                />

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

              data-testid="constructor-add-section-open"

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



function PickerGroup({

  title,

  buttons,

}: {

  title: string;

  buttons: ReactNode[];

}) {

  return (

    <div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/55">

        {title}

      </p>

      <div className="grid gap-2 sm:grid-cols-2">{buttons}</div>

    </div>

  );

}


