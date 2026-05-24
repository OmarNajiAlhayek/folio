"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { apiJson, getStoredToken, ApiError } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth-redirect";
import { toast, toastApiError } from "@/lib/toast";
import { submissionQueueShellCls } from "@/lib/submission-list-ui";

type NoteRow = {
  id: string;
  round: number;
  noteForAuthor: string;
  noteToEditorOnly?: string;
  submittedAt: string;
};

type AssignmentDetail = {
  id: string;
  slug: string | null;
  status: string;
  notes: NoteRow[];
  submission?: {
    slug: string;
    title: string;
    status: string;
    files?: Array<{ id: string; originalName: string }>;
  };
};

export default function CopyeditWorkbenchPage() {
  const t = useTranslations("Copyedit");
  const params = useParams();
  const assignmentSlug = String(params.slug ?? "");
  const pathname = usePathname();
  const router = useRouter();
  const [row, setRow] = useState<AssignmentDetail | null>(null);
  const [noteForAuthor, setNoteForAuthor] = useState("");
  const [noteToEditor, setNoteToEditor] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const items = await apiJson<AssignmentDetail[]>("/copyedit-assignments/me");
    const match = items.find((a) => a.slug === assignmentSlug);
    if (!match) {
      throw new ApiError("Not found", "NOT_FOUND", 404);
    }
    setRow(match as AssignmentDetail);
  }, [assignmentSlug]);

  useEffect(() => {
    if (!getStoredToken()) {
      redirectToLogin(router, pathname);
      return;
    }
    void load().catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin(router, pathname);
      }
    });
  }, [load, router, pathname]);

  const canSubmitNote =
    row?.status === "active" || row?.status === "ready_for_review";
  const canPublish =
    row?.status === "ready_for_review" &&
    row.submission?.status === "copyediting";

  async function submitNote() {
    if (!row?.slug) return;
    setBusy(true);
    try {
      await apiJson(`/copyedit-assignments/${row.slug}/notes`, {
        method: "POST",
        body: JSON.stringify({
          noteForAuthor,
          noteToEditorOnly: noteToEditor || undefined,
        }),
      });
      toast.success(t("noteSent"));
      setNoteForAuthor("");
      setNoteToEditor("");
      await load();
    } catch (err) {
      toastApiError(err, t("noteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    const subSlug = row?.submission?.slug;
    if (!subSlug) return;
    setBusy(true);
    try {
      await apiJson(`/submissions/${subSlug}/publish`, { method: "POST" });
      toast.success(t("published"));
      await load();
    } catch (err) {
      toastApiError(err, t("publishFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!row) {
    return (
      <main className={submissionQueueShellCls}>
        <p className="text-sm text-ink/70">{t("loading")}</p>
      </main>
    );
  }

  const sub = row.submission;

  return (
    <main className={submissionQueueShellCls}>
      <nav className="text-sm">
        <Link href="/copyedit-assignments" className="text-accent hover:underline">
          {t("backToQueue")}
        </Link>
      </nav>
      <header className="mt-4 border-s-4 border-s-accent/35 ps-5">
        <h1 className="font-serif text-2xl font-semibold text-ink">
          {sub?.title ?? t("submissionFallback")}
        </h1>
        <p className="mt-1 text-sm text-ink/65">
          {t(`assignmentStatus_${row.status}` as "assignmentStatus_active")}
        </p>
      </header>

      {sub?.slug && (
        <p className="mt-2 text-sm">
          <Link
            href={`/submissions/${sub.slug}`}
            className="text-accent hover:underline"
          >
            {t("viewSubmission")}
          </Link>
        </p>
      )}

      {row.notes?.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("queryHistory")}
          </h2>
          {[...row.notes]
            .sort((a, b) => b.round - a.round)
            .map((n) => (
              <article
                key={n.id}
                className="rounded-lg border border-ink/10 bg-paper/60 p-4"
              >
                <p className="text-xs text-ink/50">
                  {t("roundLabel", { round: String(n.round) })}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{n.noteForAuthor}</p>
              </article>
            ))}
        </section>
      )}

      {canSubmitNote && (
        <section className="mt-8 rounded-xl border border-ink/10 p-6">
          <h2 className="font-sans text-lg font-semibold">{t("newQuery")}</h2>
          <label className="mt-3 block text-sm font-medium">
            {t("noteForAuthor")}
            <textarea
              className="mt-1 w-full rounded-lg border border-ink/15 p-2 text-sm"
              rows={4}
              value={noteForAuthor}
              onChange={(e) => setNoteForAuthor(e.target.value)}
            />
          </label>
          <label className="mt-3 block text-sm font-medium">
            {t("noteToEditor")}
            <textarea
              className="mt-1 w-full rounded-lg border border-ink/15 p-2 text-sm"
              rows={2}
              value={noteToEditor}
              onChange={(e) => setNoteToEditor(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !noteForAuthor.trim()}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void submitNote()}
          >
            {t("sendQuery")}
          </button>
        </section>
      )}

      {canPublish && (
        <button
          type="button"
          disabled={busy}
          className="mt-6 rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 disabled:opacity-50"
          onClick={() => void publish()}
        >
          {t("publishButton")}
        </button>
      )}
    </main>
  );
}
