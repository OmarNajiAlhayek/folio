"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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
  /** Submission slug — only present after the draft has been saved server-side. */
  slug?: string;
  readOnly?: boolean;
  /** Errors returned by the backend after a failed submit (red banner). */
  blockingErrors?: ConstructorValidationError[];
  /**
   * Optional notification slot above the editor (e.g. "Draft saved" or
   * "Newer version detected in another tab — reloaded").
   */
  notice?: React.ReactNode;
  /** Action buttons placed in the header (Save Draft, Generate, Submit). */
  actions?: React.ReactNode;
}

/**
 * The two-column shell used by both constructor pages: editor on the start
 * side, live preview on the end side. Validation errors derived live from
 * the same shape the backend returns at submit-time.
 */
export function ConstructorWorkspace({
  content,
  onChange,
  slug,
  readOnly,
  blockingErrors,
  notice,
  actions,
}: ConstructorWorkspaceProps) {
  const t = useTranslations("ConstructorWorkspace");
  const tValidation = useTranslations("ConstructorValidation");
  const [debouncedContent, setDebouncedContent] = useState(content);

  // Live errors recompute on a 200ms debounce — the SectionList itself stays
  // responsive, the banner just trails by a tick.
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
          <LivePreview content={content} slug={slug} />
        </div>
      </div>
    </div>
  );
}
