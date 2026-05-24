"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getApiBase } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  DAMASCUS_PREVIEW_THEME_FALLBACK,
  fetchManuscriptStyleCatalog,
  type ManuscriptPreviewTheme,
  type ManuscriptStyleCatalog,
} from "@/lib/manuscript-styles-catalog";
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
  /** True when in-memory content differs from last successful autosave payload (post-slug flows). */
  hasUnsavedChanges?: boolean;
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
}: ConstructorWorkspaceProps) {
  const t = useTranslations("ConstructorWorkspace");
  const tValidation = useTranslations("ConstructorValidation");
  const tStyles = useTranslations("manuscriptStyles");
  const searchParams = useSearchParams();

  const [catalog, setCatalog] = useState<ManuscriptStyleCatalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchManuscriptStyleCatalog(getApiBase());
      if (cancelled) return;
      if (!result.ok) {
        setCatalogFailed(true);
        toast.error(t("styleCatalogError"));
        return;
      }
      setCatalog(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const previewStyleOverride = searchParams.get("previewStyleId")?.trim() ?? "";

  const previewTheme: ManuscriptPreviewTheme = useMemo(() => {
    if (!catalog) {
      return DAMASCUS_PREVIEW_THEME_FALLBACK;
    }
    const effectiveId =
      previewStyleOverride ||
      content.manuscriptStyleId?.trim() ||
      catalog.defaultStyleId;
    const row =
      catalog.styles.find((s) => s.id === effectiveId) ??
      catalog.styles.find((s) => s.id === catalog.defaultStyleId);
    return row?.previewTheme ?? DAMASCUS_PREVIEW_THEME_FALLBACK;
  }, [catalog, previewStyleOverride, content.manuscriptStyleId]);

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
      validateConstructorContentLive(debouncedContent, (code) => {
        try {
          return tValidation(`error_${code}` as const);
        } catch {
          return null;
        }
      }),
    [debouncedContent, tValidation],
  );

  const visibleErrors =
    blockingErrors && blockingErrors.length > 0 ? blockingErrors : liveErrors;
  const errorsAreBlocking = !!(blockingErrors && blockingErrors.length > 0);

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
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...content,
                  manuscriptStyleId: v || undefined,
                });
              }}
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
