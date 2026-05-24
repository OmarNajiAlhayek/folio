"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  apiPostJsonOrBlob,
  ApiError,
  getStoredToken,
} from "@/lib/api";
import { redirectToLogin } from "@/lib/auth-redirect";
import { useMe } from "@/lib/queries/auth";
import {
  usePatchSubmission,
  useSubmission,
  type SubmissionSummary,
} from "@/lib/queries/submissions";
import { takeConstructorSubmitErrors } from "@/lib/constructor-submit-errors";
import { toast, toastApiError } from "@/lib/toast";
import { PAGE_SHELL } from "@/lib/page-shell";
import { ConstructorWorkspace } from "@/components/constructor/ConstructorWorkspace";
import type {
  ConstructorContent,
  ConstructorValidationError,
} from "@/lib/constructor-content.types";

const EMPTY_CONTENT: ConstructorContent = {
  defaultDir: "ltr",
  sections: [],
};

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
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const slug = params.slug as string;

  const meQuery = useMe();
  const subQuery = useSubmission(slug);
  const patchSubmission = usePatchSubmission(slug);
  const me = meQuery.data
    ? { id: meQuery.data.id, permissions: meQuery.data.permissions }
    : null;
  const sub = subQuery.data as SubmissionSummary | undefined;
  const [content, setContentState] = useState<ConstructorContent>(EMPTY_CONTENT);
  const [submitBlockBanner, setSubmitBlockBanner] = useState<string | null>(null);
  const loading = meQuery.isLoading || subQuery.isLoading;
  const loadError =
    meQuery.isError || subQuery.isError
      ? (meQuery.error ?? subQuery.error) instanceof ApiError
        ? ((meQuery.error ?? subQuery.error) as ApiError).message
        : t("loadFailed")
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
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);

  useEffect(() => {
    const stashed = takeConstructorSubmitErrors();
    if (stashed?.length) {
      setBlockingErrors(stashed);
      setSubmitBlockBanner(t("submitBlockedByValidation"));
    }
  }, [t]);

  useEffect(() => {
    if (!getStoredToken()) {
      redirectToLogin(router, pathname);
    }
  }, [router, pathname]);

  useEffect(() => {
    if (!subQuery.data) return;
    const initial =
      (subQuery.data.constructorContent as ConstructorContent | null) ??
      EMPTY_CONTENT;
    setContentState(initial);
    lastSavedJsonRef.current = JSON.stringify(initial);
    setSavedFingerprint(JSON.stringify(initial));
  }, [subQuery.data?.id]);

  const isAuthor = !!(sub && me && sub.authorId === me.id);
  const isEditableStatus =
    sub && (sub.status === "draft" || sub.status === "revisions_requested");
  const canEdit = isAuthor && !!isEditableStatus;
  const isUploadMode =
    sub != null && sub.constructorContent == null && !content.sections.length
      ? false
      : true;

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
            toastApiError(e, t("autosaveFailed"), {
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

  const handleChange = useCallback(
    (next: ConstructorContent) => {
      setContentState(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const flushSave = useCallback(async () => {
    if (!canEdit || !sub) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const json = JSON.stringify(content);
    if (json === lastSavedJsonRef.current) return;
    setSaving(true);
    try {
      await patchSubmission.mutateAsync({ constructorContent: content });
      lastSavedJsonRef.current = json;
      setSavedFingerprint(json);
      setSavedAt(new Date());
      autosaveFailCountRef.current = 0;
    } finally {
      setSaving(false);
    }
  }, [canEdit, sub, content, patchSubmission]);

  const generate = useCallback(
    async (attach: boolean) => {
      if (!sub) return;
      setSubmitBlockBanner(null);
      if (attach) setAttaching(true);
      else setGenerating(true);
      try {
        if (attach) await flushSave();
        const enc = encodeURIComponent(sub.slug);
        const path = `/submissions/${enc}/generate-docx${
          attach ? "?attach=true" : ""
        }`;
        const result = await apiPostJsonOrBlob(path, { content, attach });
        if (result.kind === "json") {
          setSavedAt(new Date());
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
        toastApiError(
          e,
          attach ? t("attachManuscriptFailed") : t("generateFailed"),
          { id: attach ? "constructor-attach" : "constructor-generate" },
        );
      } finally {
        if (attach) setAttaching(false);
        else setGenerating(false);
      }
    },
    [sub, content, t, flushSave],
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
        <button
          type="button"
          onClick={() => void generate(false)}
          disabled={generating || attaching || !canEdit}
          data-testid="constructor-generate-docx"
          className="rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-50"
        >
          {generating ? tCommon("generating") : tCommon("downloadDocx")}
        </button>
        <button
          type="button"
          onClick={() => void generate(true)}
          disabled={generating || attaching || !canEdit}
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
          <>
            <p className="text-sm text-red-700" role="alert">
              {loadError}
            </p>
            <button
              type="button"
              className="mt-3 rounded-lg border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5"
              onClick={() => {
                void meQuery.refetch();
                void subQuery.refetch();
              }}
            >
              {t("retryLoad")}
            </button>
          </>
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
            actions={headerActions}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </Suspense>
      </section>
    </main>
  );
}
