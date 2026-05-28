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
    <div className="space-y-6">
      {/* Interactive Progress Header & Direction Settings */}
      <div className="flex flex-col gap-4 rounded-xl border border-ink/10 bg-surface/75 p-5 shadow-xs backdrop-blur-[3px] transition hover:border-ink/15 hover:shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-ink/70">
              {t("defaultDirLabel")}
            </span>
            <div role="group" className="flex overflow-hidden rounded-lg border border-ink/15 shadow-2xs">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setDefaultDir("ltr")}
                className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  content.defaultDir === "ltr"
                    ? "bg-accent text-white shadow-2xs"
                    : "bg-paper text-ink/70 hover:bg-paper-mid hover:text-ink"
                }`}
              >
                {t("dirLtr")}
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setDefaultDir("rtl")}
                className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  content.defaultDir === "rtl"
                    ? "bg-accent text-white shadow-2xs"
                    : "bg-paper text-ink/70 hover:bg-paper-mid hover:text-ink"
                }`}
              >
                {t("dirRtl")}
              </button>
            </div>
          </div>
          <div className="text-xs font-semibold text-ink/75 flex items-center gap-1.5 bg-ink/5 dark:bg-white/5 rounded-full px-3 py-1.5 border border-ink/5">
            <span className="font-serif tracking-wide">
              {t("wordCountBadge", {
                count: wordEstimate.weighted,
                limit: PAGE_LIMIT_WORDS,
              })}
            </span>
          </div>
        </div>

        {/* Dynamic Word Count Progress Bar */}
        <div 
          className="relative h-2 w-full overflow-hidden rounded-full bg-ink/10 dark:bg-white/10 shadow-inner"
          title={t("wordCountTitle", { limit: PAGE_LIMIT_WORDS })}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              wordEstimate.warn
                ? "bg-linear-to-r from-amber-500 to-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                : "bg-linear-to-r from-emerald-500 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
            }`}
            style={{
              width: `${Math.min(100, (wordEstimate.weighted / PAGE_LIMIT_WORDS) * 100)}%`,
            }}
          />
        </div>
      </div>

      {recommendedMissing.length > 0 && !readOnly ? (
        <div
          className="rounded-xl border border-amber-300/80 bg-amber-100/40 px-5 py-4 shadow-2xs backdrop-blur-[2px] text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200 animate-fade-in"
          data-testid="constructor-recommended-presets"
        >
          <div className="flex items-center gap-2 font-semibold">
            <svg className="size-4 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p>{t("recommendedPresetsTitle")}</p>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {recommendedMissing.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => insertPreset(id)}
                  className="rounded-lg border border-amber-400/50 bg-paper px-3 py-1.5 text-xs font-semibold text-amber-950 dark:text-amber-100 hover:border-accent hover:bg-accent/5 transition-all cursor-pointer shadow-3xs"
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

      <ul className="space-y-4">
        {content.sections.map((section, idx) => {
          // Dynamic category themes for cards
          const visual = (() => {
            switch (section.kind) {
              case "title":
              case "authors":
              case "abstract":
                return {
                  border: "border-l-4 border-l-amber-500/75 dark:border-l-amber-500/90",
                  shadow: "hover:shadow-[0_0_15px_rgba(245,158,11,0.06)] dark:hover:shadow-[0_0_15px_rgba(245,158,11,0.04)]",
                  badge: "bg-amber-100/75 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
                };
              case "heading1":
              case "heading2":
              case "heading3":
              case "paragraph":
                return {
                  border: "border-l-4 border-l-emerald-500/75 dark:border-l-emerald-500/90",
                  shadow: "hover:shadow-[0_0_15px_rgba(16,185,129,0.06)] dark:hover:shadow-[0_0_15px_rgba(16,185,129,0.04)]",
                  badge: "bg-emerald-100/75 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
                };
              case "image":
              case "table":
              case "equation":
                return {
                  border: "border-l-4 border-l-violet-500/75 dark:border-l-violet-500/90",
                  shadow: "hover:shadow-[0_0_15px_rgba(139,92,246,0.06)] dark:hover:shadow-[0_0_15px_rgba(139,92,246,0.04)]",
                  badge: "bg-violet-100/75 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
                };
              default:
                return {
                  border: "border-l-4 border-l-slate-400/75 dark:border-l-slate-400/90",
                  shadow: "hover:shadow-[0_0_15px_rgba(148,163,184,0.06)] dark:hover:shadow-[0_0_15px_rgba(148,163,184,0.04)]",
                  badge: "bg-slate-100/75 text-slate-800 dark:bg-slate-500/15 dark:text-slate-300",
                };
            }
          })();

          return (
            <li
              key={section.id}
              id={`constructor-section-${section.id}`}
              className={`group rounded-xl border border-ink/10 bg-surface p-5 shadow-xs transition-all duration-300 hover:-translate-y-[1px] hover:border-ink/15 hover:shadow-md ${visual.border} ${visual.shadow}`}
            >
              <div className="mb-4 flex items-center justify-between gap-2 border-b border-ink/5 pb-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${visual.badge}`}>
                  {section.kind === "title" && (section as TitleSection).lang
                    ? t(`kind_title_${(section as TitleSection).lang}` as const)
                    : t(`kind_${section.kind}` as const)}
                </span>
                <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    disabled={readOnly || idx === 0}
                    onClick={() => move(idx, -1)}
                    className="rounded-lg border border-ink/15 bg-paper p-1.5 text-xs text-ink/70 hover:bg-ink/5 hover:border-accent/40 hover:text-accent disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-3xs"
                    aria-label={t("moveUp")}
                    title={t("moveUp")}
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={readOnly || idx === content.sections.length - 1}
                    onClick={() => move(idx, 1)}
                    className="rounded-lg border border-ink/15 bg-paper p-1.5 text-xs text-ink/70 hover:bg-ink/5 hover:border-accent/40 hover:text-accent disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-3xs"
                    aria-label={t("moveDown")}
                    title={t("moveDown")}
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={readOnly || !!section.pinned}
                    onClick={() => removeSection(idx)}
                    className="rounded-lg border border-red-200 bg-red-50/50 p-1.5 text-xs text-red-700 hover:bg-red-100/85 hover:border-red-300 dark:border-red-500/25 dark:bg-red-500/5 dark:text-red-300 dark:hover:bg-red-500/20 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shadow-3xs"
                    aria-label={t("remove")}
                    title={t("remove")}
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
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
                  <ul className="mt-3 space-y-1 rounded-lg bg-red-50/50 dark:bg-red-500/5 px-3 py-2 border border-red-200/50 dark:border-red-500/15">
                    {errs.map((e, i) => (
                      <li
                        key={i}
                        className={`text-xs font-semibold flex items-center gap-1.5 ${errorsAreBlocking ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}
                      >
                        <span className="size-1 rounded-full bg-current shrink-0" />
                        {e.message}
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className="rounded-2xl border border-dashed border-ink/20 bg-paper/20 p-5 shadow-2xs backdrop-blur-[1px] transition-all duration-300 hover:border-accent/30 hover:bg-paper/35">
          {addPickerOpen ? (
            <div className="animate-fade-in space-y-5">
              <div className="flex items-center justify-between gap-3 border-b border-ink/10 pb-2">
                <p className="text-sm font-bold text-ink">
                  {t("addPickerTitle")}
                </p>
                <button
                  type="button"
                  onClick={() => setAddPickerOpen(false)}
                  className="rounded-full hover:bg-ink/5 p-1 text-ink/50 hover:text-ink cursor-pointer transition-colors"
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-5">
                <PickerGroup
                  title={t("pickerGroup_presets")}
                  buttons={presetIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      data-testid={`constructor-add-preset-${id}`}
                      onClick={() => insertPreset(id)}
                      className="group/btn flex items-center gap-3 rounded-xl border border-ink/10 bg-surface px-4 py-3 text-start text-xs font-semibold text-ink/80 hover:border-amber-400/50 hover:bg-amber-100/5 hover:-translate-y-0.5 transition-all shadow-3xs cursor-pointer"
                    >
                      <span className="rounded-lg bg-amber-100 dark:bg-amber-500/10 p-2 text-amber-600 dark:text-amber-300 group-hover/btn:scale-110 transition-transform">
                        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.03 0 1.9.693 2.166 1.638m-7.377 2.24l-.407 1.451a2.25 2.25 0 001.322 2.684l4.9 1.96m-7.815-6.095l-.407 1.45a2.25 2.25 0 001.322 2.684l4.9 1.96m-7.815-6.095v11.625c0 .375-.125.727-.336 1.014m12.336-12.639v11.625c0 .375.125.727.336 1.014M9 9h7.5" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-bold text-ink text-sm">{t(presetHeadingKey(id))}</p>
                        <p className="font-normal text-ink/50 text-[10px] mt-0.5">Insert scholarly preset structure</p>
                      </div>
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
                      className="group/btn flex items-center gap-3 rounded-xl border border-ink/10 bg-surface px-4 py-3 text-start text-xs font-semibold text-ink/80 hover:border-emerald-400/50 hover:bg-emerald-100/5 hover:-translate-y-0.5 transition-all shadow-3xs cursor-pointer"
                    >
                      <span className="rounded-lg bg-emerald-100 dark:bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-300 group-hover/btn:scale-110 transition-transform">
                        {kind.startsWith("heading") ? (
                          <span className="font-serif text-[10px] font-extrabold tracking-tight">H{kind.replace("heading", "")}</span>
                        ) : (
                          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                          </svg>
                        )}
                      </span>
                      <div>
                        <p className="font-bold text-ink text-sm">{t(`kind_${kind}` as const)}</p>
                        <p className="font-normal text-ink/50 text-[10px] mt-0.5">Add body text blocks</p>
                      </div>
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
                      className="group/btn flex items-center gap-3 rounded-xl border border-ink/10 bg-surface px-4 py-3 text-start text-xs font-semibold text-ink/80 hover:border-violet-400/50 hover:bg-violet-100/5 hover:-translate-y-0.5 transition-all shadow-3xs cursor-pointer"
                    >
                      <span className="rounded-lg bg-violet-100 dark:bg-violet-500/10 p-2 text-violet-600 dark:text-violet-300 group-hover/btn:scale-110 transition-transform">
                        {kind === "image" ? (
                          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                        ) : kind === "table" ? (
                          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5M3.75 5.25v13.5m16.5-13.5v13.5" />
                          </svg>
                        ) : (
                          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-3-9v9M9 13.5V18m3-12h.008v.008H12V6zm0 0h.008v.008H12V6z" />
                          </svg>
                        )}
                      </span>
                      <div>
                        <p className="font-bold text-ink text-sm">{t(`kind_${kind}` as const)}</p>
                        <p className="font-normal text-ink/50 text-[10px] mt-0.5">Insert rich elements</p>
                      </div>
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
                      className="group/btn flex items-center gap-3 rounded-xl border border-ink/10 bg-surface px-4 py-3 text-start text-xs font-semibold text-ink/80 hover:border-slate-400/50 hover:bg-slate-100/5 hover:-translate-y-0.5 transition-all shadow-3xs cursor-pointer"
                    >
                      <span className="rounded-lg bg-slate-100 dark:bg-slate-500/10 p-2 text-slate-600 dark:text-slate-300 group-hover/btn:scale-110 transition-transform">
                        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 11.263 1.302l-.084.017a.75.75 0 00-.77 1.002l.135.338a.75.75 0 01-.777 1.022h-.033a.75.75 0 00-.705.513l-.102.307a.75.75 0 01-1.422-.474l.102-.307a2.25 2.25 0 012.116-1.54h.033a.75.75 0 00.705-.513l.102-.307a.75.75 0 011.422.474l-.102.307a2.25 2.25 0 01-2.116 1.54h-.033a.75.75 0 00-.705.513l-.102.307a.75.75 0 01-1.422-.474l.102-.307a2.25 2.25 0 012.116-1.54h.033" />
                        </svg>
                      </span>
                      <div>
                        <p className="font-bold text-ink text-sm">{t(`kind_${kind}` as const)}</p>
                        <p className="font-normal text-ink/50 text-[10px] mt-0.5">Funding and acknowledgments</p>
                      </div>
                    </button>
                  ))}
                />
              </div>

              <div className="mt-4 border-t border-ink/10 pt-3 text-end">
                <button
                  type="button"
                  onClick={() => setAddPickerOpen(false)}
                  className="rounded-lg bg-ink/5 px-4 py-2 text-xs font-semibold text-ink/70 hover:bg-ink/10 transition-colors cursor-pointer"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="constructor-add-section-open"
              onClick={() => setAddPickerOpen(true)}
              className="w-full rounded-xl border border-dashed border-accent/40 bg-accent/5 px-4 py-3.5 text-sm font-semibold text-accent hover:bg-accent/10 hover:border-accent/60 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-3xs"
            >
              <svg className="size-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
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
    <div className="space-y-2">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink/45">
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">{buttons}</div>
    </div>
  );
}


