"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import {
  apiJson,
  ApiError,
  getApiBase,
  getStoredToken,
} from "@/lib/api";
import { PAGE_SHELL } from "@/lib/page-shell";
import { ConstructorWorkspace } from "@/components/constructor/ConstructorWorkspace";
import type {
  ConstructorContent,
  ConstructorValidationError,
} from "@/lib/constructor-content.types";

interface SubmissionSummary {
  id: string;
  slug: string;
  status: string;
  authorId: string;
  constructorContent: ConstructorContent | null;
}

interface MeShape {
  id: string;
  permissions?: string[];
}

const EMPTY_CONTENT: ConstructorContent = {
  defaultDir: "ltr",
  sections: [],
};

const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Post-slug constructor: loaded after a draft submission exists. Auto-saves
 * to the backend with a 1.5s debounce. Generate / Submit buttons are wired
 * directly to the existing endpoints.
 */
export default function SubmissionConstructorPage() {
  const t = useTranslations("ConstructorPage");
  const tCommon = useTranslations("ConstructorWorkspace");
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [me, setMe] = useState<MeShape | null>(null);
  const [sub, setSub] = useState<SubmissionSummary | null>(null);
  const [content, setContentState] = useState<ConstructorContent>(EMPTY_CONTENT);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [blockingErrors, setBlockingErrors] = useState<
    ConstructorValidationError[]
  >([]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJsonRef = useRef<string>("");

  // Hydrate
  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const enc = encodeURIComponent(slug);
        const [m, s] = await Promise.all([
          apiJson<MeShape>("/auth/me"),
          apiJson<SubmissionSummary>(`/submissions/${enc}`),
        ]);
        if (cancelled) return;
        setMe(m);
        setSub(s);
        const initial = s.constructorContent ?? EMPTY_CONTENT;
        setContentState(initial);
        lastSavedJsonRef.current = JSON.stringify(initial);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, router, t]);

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
          await apiJson(`/submissions/${encodeURIComponent(sub.slug)}`, {
            method: "PATCH",
            body: JSON.stringify({ constructorContent: next }),
          });
          lastSavedJsonRef.current = json;
          setSavedAt(new Date());
          setBlockingErrors([]); // any successful save invalidates a stale block
        } catch (e) {
          setError(e instanceof ApiError ? e.message : t("autosaveFailed"));
        } finally {
          setSaving(false);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [canEdit, sub, t],
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
      await apiJson(`/submissions/${encodeURIComponent(sub.slug)}`, {
        method: "PATCH",
        body: JSON.stringify({ constructorContent: content }),
      });
      lastSavedJsonRef.current = json;
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }, [canEdit, sub, content]);

  const generate = useCallback(
    async (attach: boolean) => {
      if (!sub) return;
      setError(null);
      setGenerating(true);
      try {
        // Always send the live content to avoid the auto-save race.
        const enc = encodeURIComponent(sub.slug);
        const url = `${getApiBase()}/api/v1/submissions/${enc}/generate-docx${
          attach ? "?attach=true" : ""
        }`;
        const token = getStoredToken();
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ content, attach }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new ApiError(text || res.statusText, undefined, res.status);
        }
        if (attach) {
          // Server returned the attached file row — re-load to get latest state.
          setSavedAt(new Date());
        } else {
          const blob = await res.blob();
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
        setError(e instanceof ApiError ? e.message : t("generateFailed"));
      } finally {
        setGenerating(false);
      }
    },
    [sub, content, t],
  );

  const submit = useCallback(async () => {
    if (!sub) return;
    setError(null);
    setSubmitting(true);
    try {
      // Flush any pending edits, then attach a freshly-generated .docx as the
      // manuscript so the editorial flow has a real file to work with, then
      // call the existing submit endpoint.
      await flushSave();
      await generate(true);
      await apiJson(`/submissions/${encodeURIComponent(sub.slug)}/submit`, {
        method: "POST",
      });
      router.replace(`/submissions/${encodeURIComponent(sub.slug)}`);
    } catch (e) {
      // Backend submit-time validator returns
      //   { message, code: "CONSTRUCTOR_VALIDATION_FAILED",
      //     errors: [{ code, message, sectionId }] }
      // which `ApiError.details` exposes verbatim.
      if (
        e instanceof ApiError &&
        e.code === "CONSTRUCTOR_VALIDATION_FAILED" &&
        Array.isArray(e.details?.errors)
      ) {
        setBlockingErrors(
          (e.details!.errors as ConstructorValidationError[]) ?? [],
        );
        setError(t("submitBlockedByValidation"));
      } else {
        setError(e instanceof ApiError ? e.message : t("submitFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [sub, flushSave, generate, router, t]);

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
          disabled={generating || !canEdit}
          data-testid="constructor-generate-docx"
          className="rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-50"
        >
          {generating ? tCommon("generating") : tCommon("downloadDocx")}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !canEdit}
          data-testid="constructor-submit"
          className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {submitting ? tCommon("submitting") : tCommon("submit")}
        </button>
      </div>
    );
  }, [
    sub,
    saving,
    savedAt,
    generating,
    submitting,
    canEdit,
    generate,
    submit,
    tCommon,
  ]);

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
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
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

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
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
        <ConstructorWorkspace
          content={content}
          onChange={handleChange}
          slug={sub.slug}
          readOnly={!canEdit}
          blockingErrors={blockingErrors}
          actions={headerActions}
        />
      </section>
    </main>
  );
}

