"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import {
  DAMASCUS_PREVIEW_THEME_FALLBACK,
  type ManuscriptPreviewTheme,
} from "@/lib/manuscript-styles-catalog";
import { ensureMandatoryConstructorSections } from "@/lib/constructor-mandatory-sections";
import type { SubmissionArticleType } from "@/lib/constructor-section-presets";
import {
  guidanceFromCatalogEntry,
  useConstructorStyleGuidance,
} from "@/lib/use-constructor-style-guidance";
import { SectionList } from "./SectionList";
import { LivePreview } from "./LivePreview";
import { validateConstructorContentLive } from "@/lib/constructor-validation";
import type {
  ConstructorContent,
  ConstructorValidationError,
} from "@/lib/constructor-content.types";

interface ConstructorWorkspaceProps {
  content: ConstructorContent;
  onChange: (next: ConstructorContent) => void;
  slug?: string;
  readOnly?: boolean;
  blockingErrors?: ConstructorValidationError[];
  notice?: React.ReactNode;
  actions?: React.ReactNode;
  hasUnsavedChanges?: boolean;
  articleType?: SubmissionArticleType | null;
}

export function ConstructorWorkspace({
  content,
  onChange,
  slug,
  readOnly,
  blockingErrors,
  notice,
  actions,
  hasUnsavedChanges,
  articleType = null,
}: ConstructorWorkspaceProps) {
  const t = useTranslations("ConstructorWorkspace");
  const tValidation = useTranslations("ConstructorValidation");
  const tStyles = useTranslations("manuscriptStyles");
  const searchParams = useSearchParams();
  const previewStyleId = searchParams.get("previewStyleId")?.trim() ?? "";
  const prevStyleId = useRef(content.manuscriptStyleId);
  const { catalog, catalogFailed, catalogEntry, guidance } =
    useConstructorStyleGuidance(content, { previewStyleId });

  useEffect(() => {
    if (catalogFailed) toast.error(t("styleCatalogError"));
  }, [catalogFailed, t]);

  const previewTheme: ManuscriptPreviewTheme = useMemo(() => {
    if (!catalog) {
      return DAMASCUS_PREVIEW_THEME_FALLBACK;
    }
    return catalogEntry?.previewTheme ?? DAMASCUS_PREVIEW_THEME_FALLBACK;
  }, [catalog, catalogEntry]);

  const styleSelectDisabled = !!readOnly || catalogFailed || !catalog;

  const selectValue =
    content.manuscriptStyleId?.trim() ||
    catalog?.defaultStyleId ||
    "";

  const [debouncedContent, setDebouncedContent] = useState(content);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedContent(content), 200);
    return () => clearTimeout(handle);
  }, [content]);

  const liveErrors = useMemo(
    () =>
      validateConstructorContentLive(
        debouncedContent,
        (code) => {
          try {
            return tValidation(`error_${code}` as const);
          } catch {
            return null;
          }
        },
        guidance,
      ),
    [debouncedContent, tValidation, guidance],
  );

  const visibleErrors =
    blockingErrors && blockingErrors.length > 0 ? blockingErrors : liveErrors;
  const errorsAreBlocking = !!(blockingErrors && blockingErrors.length > 0);

  function handleStyleChange(nextStyleId: string) {
    const nextContent: ConstructorContent = {
      ...content,
      manuscriptStyleId: nextStyleId || undefined,
    };
    const nextEntry = catalog?.styles.find((s) => s.id === nextStyleId);
    const nextGuidance = guidanceFromCatalogEntry(nextEntry);
    const beforeCount = content.sections.length;
    const ensured = ensureMandatoryConstructorSections(nextContent, nextGuidance);
    if (ensured.sections.length > beforeCount) {
      toast.info(t("stylePinnedSectionsAdded"));
    }
    onChange(ensured);
    prevStyleId.current = nextStyleId;
  }

  return (
    <div className="space-y-4">
      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
      {notice}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink">
            {t("editorHeading")}
          </h2>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="folio-manuscript-style" className="font-medium text-ink">
              {t("styleLabel")}
              {hasUnsavedChanges ? (
                <span className="ml-1.5 font-normal text-amber-800 dark:text-amber-200/90">
                  ({t("styleUnsavedHint")})
                </span>
              ) : null}
            </label>
            <select
              id="folio-manuscript-style"
              className="rounded-md border border-ink/20 bg-paper px-2 py-1.5 text-ink disabled:opacity-50"
              disabled={styleSelectDisabled}
              value={selectValue}
              onChange={(e) => handleStyleChange(e.target.value)}
            >
              {catalog?.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {(tStyles as (key: string) => string)(`${s.id}.displayName`)}
                </option>
              )) ?? (
                <option value={selectValue}>{selectValue}</option>
              )}
            </select>
          </div>
          <SectionList
            content={content}
            onChange={onChange}
            errors={visibleErrors}
            slug={slug}
            readOnly={readOnly}
            errorsAreBlocking={errorsAreBlocking}
            articleType={articleType}
            guidance={guidance}
          />
        </div>
        <div className="min-w-0">
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink">
            {t("previewHeading")}
          </h2>
          <LivePreview
            content={content}
            slug={slug}
            previewTheme={previewTheme}
          />
        </div>
      </div>
    </div>
  );
}
