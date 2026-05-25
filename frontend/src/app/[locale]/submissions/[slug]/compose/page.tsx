"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { apiPostJsonOrBlob } from "@/lib/api";
import { ApiErrorState } from "@/components/api-error-state";
import { getApiErrorKind } from "@/lib/api-error-message";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useMe } from "@/lib/queries/auth";
import { canManageOwnSubmissions } from "@/lib/permissions";
import {
  useInvalidateSubmission,
  useInvalidateSubmissionDetail,
  usePatchSubmission,
  useSubmission,
  type SubmissionSummary,
} from "@/lib/queries/submissions";
import { takeConstructorSubmitErrors } from "@/lib/constructor-submit-errors";
import { toast } from "@/lib/toast";
import { useToastApiError } from "@/lib/use-toast-api-error";
import { PAGE_SHELL } from "@/lib/page-shell";
import { ConstructorWorkspace } from "@/components/constructor/ConstructorWorkspace";
import type {
  ConstructorContent,
  ConstructorValidationError,
} from "@/lib/constructor-content.types";
import { ensureMandatoryConstructorSections } from "@/lib/constructor-mandatory-sections";
import { sanitizeConstructorContent } from "@/lib/sanitize-constructor-html";
import type { SubmissionArticleType } from "@/lib/constructor-section-presets";
import { constructorDraftHasMeaningfulContent } from "@/lib/constructor-import-merge";
import { useConstructorDocxImport } from "@/lib/use-constructor-docx-import";
import { useConstructorStyleGuidance } from "@/lib/use-constructor-style-guidance";

const AUTOSAVE_DEBOUNCE_MS = 1500;
/** Autosave surface: toast-after-3 — show one error toast only after this many consecutive failures. */
const AUTOSAVE_FAILURES_BEFORE_TOAST = 3;

/**
 * Post-slug constructor: loaded after a draft submission exists. Auto-saves
 * to the backend with a 1.5s debounce. Generate / attach manuscript only —
 * submit for review lives on the submission detail page.
 */
export default function SubmissionConstructorPage() {
  const t = useTranslations("ConstructorPage");
  const tCommon = useTranslations("ConstructorWorkspace");
  const tApi = useTranslations("ApiErrors");
  const locale = useLocale();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const params = useParams();
  const slug = params.slug as string;
  const showApiError = useToastApiError();

  const meQuery = useMe();
  const subQuery = useSubmission(slug);
  const patchSubmission = usePatchSubmission(slug);
  const invalidateDetail = useInvalidateSubmissionDetail();
  const invalidateSubmission = useInvalidateSubmission();
  const me = meQuery.data
    ? { id: meQuery.data.id, permissions: meQuery.data.permissions }
    : null;
  const sub = subQuery.data as SubmissionSummary | undefined;
  const [content, setContentState] = useState<ConstructorContent>(() =>
    ensureMandatoryConstructorSections({ defaultDir: "ltr", sections: [] }),
  );
  const [submitBlockBanner, setSubmitBlockBanner] = useState<string | null>(null);
  const loading = meQuery.isPending || subQuery.isPending;
  const loadErrorCause = meQuery.isError
    ? meQuery.error
    : subQuery.isError
      ? subQuery.error
      : null;
  const loadError =
    loadErrorCause != null
      ? resolveApiError(loadErrorCause, t("loadFailed"))
      : null;
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [generating, setGenerating] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [blockingErrors, setBlockingErrors] = useState<
    ConstructorValidationError[]
  >([]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJsonRef = useRef<string>("");
  const autosaveFailCountRef = useRef(0);
  const hydratedSlugRef = useRef<string | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);

  useEffect(() => {
    const stashed = takeConstructorSubmitErrors();
    if (stashed?.length) {
      setBlockingErrors(stashed);
      setSubmitBlockBanner(t("submitBlockedByValidation"));
    }
  }, [t]);

  /** Hydrate editor once per slug; do not overwrite in-progress edits on refetch. */
  useEffect(() => {
    const data = subQuery.data;
    if (!data || data.slug !== slug) return;
    if (hydratedSlugRef.current === slug) return;
    hydratedSlugRef.current = slug;
    const raw =
      (data.constructorContent as ConstructorContent | null) ?? {
        defaultDir: "ltr",
        sections: [],
      };
    const initial = sanitizeConstructorContent(
      ensureMandatoryConstructorSections(raw),
    );
    setContentState(initial);
    const json = JSON.stringify(initial);
    lastSavedJsonRef.current = json;
    setSavedFingerprint(json);
  }, [slug, subQuery.data]);

  const isAuthor = !!(sub && me && sub.authorId === me.id);
  const canManageOwn = me ? canManageOwnSubmissions(me.permissions) : false;
  const isEditableStatus =
    sub && (sub.status === "draft" || sub.status === "revisions_requested");
  const canEdit = canManageOwn && isAuthor && !!isEditableStatus;
  const isUploadMode =
    sub != null &&
    sub.constructorContent == null &&
    !constructorDraftHasMeaningfulContent(content);

  // Autosave
  const scheduleSave = useCallback(
    (next: ConstructorContent) => {
      if (!canEdit || !sub) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const json = JSON.stringify(next);
        if (json === lastSavedJsonRef.current) return;
        setSaving(true);
        try {
          await patchSubmission.mutateAsync({ constructorContent: next });
          lastSavedJsonRef.current = json;
          setSavedFingerprint(json);
          setSavedAt(new Date());
          setBlockingErrors([]);
          autosaveFailCountRef.current = 0;
        } catch (e) {
          autosaveFailCountRef.current += 1;
          if (autosaveFailCountRef.current >= AUTOSAVE_FAILURES_BEFORE_TOAST) {
            showApiError(e, t("autosaveFailed"), {
              id: "constructor-autosave",
            });
            autosaveFailCountRef.current = 0;
          }
        } finally {
          setSaving(false);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [canEdit, sub, t, patchSubmission],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const { guidance } = useConstructorStyleGuidance(content);

  const handleChange = useCallback(
    (next: ConstructorContent) => {
      const normalized = sanitizeConstructorContent(
        ensureMandatoryConstructorSections(next, guidance),
      );
      setContentState(normalized);
      scheduleSave(normalized);
    },
    [scheduleSave, guidance],
  );

  const flushSave = useCallback(async () => {
    if (!canEdit || !sub) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const payload = sanitizeConstructorContent(content);
    const json = JSON.stringify(payload);
    if (json === lastSavedJsonRef.current) return;
    setSaving(true);
    try {
      await patchSubmission.mutateAsync({ constructorContent: payload });
      lastSavedJsonRef.current = json;
      setSavedFingerprint(json);
      setSavedAt(new Date());
      autosaveFailCountRef.current = 0;
    } finally {
      setSaving(false);
    }
  }, [canEdit, sub, content, patchSubmission]);

  const {
    importButton,
    importWarningsNotice,
    confirmDialog,
    importing: importingDocx,
  } = useConstructorDocxImport({
    content,
    guidance,
    onContentChange: (merged) => {
      const normalized = ensureMandatoryConstructorSections(merged, guidance);
      setContentState(normalized);
      scheduleSave(normalized);
    },
    scopeKey: slug,
    canImport: canEdit,
    locale,
    t,
    actionsDisabled: generating || attaching,
  });

  const generate = useCallback(
    async (attach: boolean) => {
      if (!sub) return;
      setSubmitBlockBanner(null);
      if (attach) setAttaching(true);
      else setGenerating(true);
      try {
        if (attach) await flushSave();
        const enc = encodeURIComponent(sub.slug);
        const hasUploadedManuscript = (sub.files ?? []).some(
          (f) => f.kind === "manuscript",
        );
        const attachKind =
          attach && hasUploadedManuscript
            ? "manuscript_constructor"
            : "manuscript";
        const path = `/submissions/${enc}/generate-docx${
          attach ? "?attach=true" : ""
        }`;
        const result = await apiPostJsonOrBlob(path, {
          content,
          attach,
          ...(attach ? { attachKind } : {}),
        });
        if (result.kind === "json") {
          setSavedAt(new Date());
          invalidateDetail(sub.slug);
          invalidateSubmission(sub.slug);
          toast.success(t("attachManuscriptSuccess"), {
            id: "constructor-attach-success",
          });
        } else {
          const blob = result.data;
          const dlUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = dlUrl;
          a.download = `${sub.slug}.docx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(dlUrl);
        }
      } catch (e) {
        showApiError(
          e,
          attach ? t("attachManuscriptFailed") : t("generateFailed"),
          { id: attach ? "constructor-attach" : "constructor-generate" },
        );
      } finally {
        if (attach) setAttaching(false);
        else setGenerating(false);
      }
    },
    [sub, content, t, flushSave, invalidateDetail, invalidateSubmission],
  );

  const headerActions = useMemo(() => {
    if (!sub) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {saving ? (
          <span className="text-xs text-ink/55">{tCommon("autosaving")}</span>
        ) : savedAt ? (
          <span className="text-xs text-ink/55">
            {tCommon("savedAt", {
              time: savedAt.toLocaleTimeString(),
            })}
          </span>
        ) : null}
        {importButton}
        <button
          type="button"
          onClick={() => void generate(false)}
          disabled={generating || attaching || !canEdit || importingDocx}
          data-testid="constructor-generate-docx"
          className="rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-50"
        >
          {generating ? tCommon("generating") : tCommon("downloadDocx")}
        </button>
        <button
          type="button"
          onClick={() => void generate(true)}
          disabled={generating || attaching || !canEdit || importingDocx}
          data-testid="constructor-attach-manuscript"
          className="rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-50"
        >
          {attaching ? t("attachingManuscript") : t("attachManuscript")}
        </button>
        <Link
          href={`/submissions/${encodeURIComponent(sub.slug)}`}
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
        >
          {t("backToSubmission")}
        </Link>
      </div>
    );
  }, [
    sub,
    saving,
    savedAt,
    generating,
    attaching,
    canEdit,
    generate,
    importButton,
    importingDocx,
    t,
    tCommon,
  ]);

  const hasUnsavedChanges =
    savedFingerprint !== null &&
    JSON.stringify(content) !== savedFingerprint;

  if (loading) {
    return (
      <main className={PAGE_SHELL}>
        <p className="text-sm text-ink/60">{t("loading")}</p>
      </main>
    );
  }
  if (!sub || !me) {
    return (
      <main className={PAGE_SHELL}>
        {loadError ? (
          <ApiErrorState
            className="max-w-none px-0 py-0"
            message={loadError}
            error={loadErrorCause}
            hint={
              loadErrorCause && getApiErrorKind(loadErrorCause) === "rateLimit"
                ? tApi("rateLimitHint")
                : undefined
            }
            onRetry={() => {
              void meQuery.refetch();
              void subQuery.refetch();
            }}
            retryLabel={tApi("retry")}
            backHref={`/submissions/${encodeURIComponent(slug)}`}
            backLabel={t("backToSubmission")}
          />
        ) : (
          <p className="text-sm text-ink/60">{t("notFound")}</p>
        )}
        <p className="mt-2">
          <Link
            href="/submissions"
            className="text-sm text-accent hover:underline"
          >
            {t("backToList")}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className={PAGE_SHELL}>
      {confirmDialog}
      <Link
        href={`/submissions/${encodeURIComponent(sub.slug)}`}
        className="text-sm text-accent hover:underline"
      >
        {t("backToSubmission")}
      </Link>
      <header className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">
            {t("titleEdit")}
          </h1>
          <p className="mt-1 text-sm text-ink/65">{t("subtitleEdit")}</p>
        </div>
      </header>

      {submitBlockBanner ? (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {submitBlockBanner}
        </div>
      ) : null}

      {!canEdit && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {!isAuthor
            ? t("readOnlyNotOwner")
            : t("readOnlyStatus", { status: sub.status })}
        </div>
      )}

      {isUploadMode && sub.constructorContent == null ? (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {t("uploadModeWarning")}
        </div>
      ) : null}

      <section className="mt-6">
        <Suspense
          fallback={
            <p className="text-sm text-ink/60">{t("loading")}</p>
          }
        >
          <ConstructorWorkspace
            content={content}
            onChange={handleChange}
            slug={sub.slug}
            readOnly={!canEdit}
            blockingErrors={blockingErrors}
            notice={importWarningsNotice}
            actions={headerActions}
            hasUnsavedChanges={hasUnsavedChanges}
            articleType={(sub.articleType as SubmissionArticleType) ?? null}
          />
        </Suspense>
      </section>
    </main>
  );
}
