"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { apiJson, apiUpload, ApiError } from "@/lib/api";
import { toast, toastApiError } from "@/lib/toast";
import { PERMISSION_SLUGS } from "@/lib/permissions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { statusPillClass } from "@/lib/submission-list-ui";
import { fileExceedsUploadLimit, MAX_UPLOAD_MB } from "@/lib/validation";

type CopyeditorCandidate = {
  id: string;
  displayName: string;
  email: string;
};

type CopyeditNoteRow = {
  id: string;
  assignmentId: string;
  assignmentSlug?: string;
  round: number;
  noteForAuthor: string;
  noteToEditorOnly?: string;
  submittedAt: string;
  assignmentStatus?: string;
  copyeditor?: { id: string; displayName: string };
};

type CopyeditAssignmentRow = {
  id: string;
  slug: string | null;
  status: string;
  copyeditor?: { id: string; displayName: string; email: string };
  notes?: CopyeditNoteRow[];
};

export function CopyeditSection({
  submissionSlug,
  submissionStatus,
  isAuthor,
  isEditor,
  permissions,
  onReload,
}: {
  submissionSlug: string;
  submissionStatus: string;
  isAuthor: boolean;
  isEditor: boolean;
  permissions: string[];
  onReload: () => void;
}) {
  const t = useTranslations("Copyedit");
  const canAssign = permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR,
  );
  const [candidates, setCandidates] = useState<CopyeditorCandidate[]>([]);
  const [selectedCopyeditor, setSelectedCopyeditor] = useState("");
  const [assignments, setAssignments] = useState<CopyeditAssignmentRow[]>([]);
  const [notes, setNotes] = useState<CopyeditNoteRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const noteRows = await apiJson<CopyeditNoteRow[]>(
      `/submissions/${submissionSlug}/copyedit-notes`,
    );
    setNotes(noteRows);
    if (isEditor) {
      const rows = await apiJson<CopyeditAssignmentRow[]>(
        `/submissions/${submissionSlug}/copyedit-assignments`,
      );
      setAssignments(rows);
    }
  }, [submissionSlug, isEditor]);

  useEffect(() => {
    if (!isAuthor && !isEditor) return;
    void load().catch(() => undefined);
  }, [isAuthor, isEditor, load]);

  useEffect(() => {
    if (!canAssign || submissionStatus !== "accepted") return;
    void apiJson<CopyeditorCandidate[]>("/users/copyeditor-candidates")
      .then(setCandidates)
      .catch(() => undefined);
  }, [canAssign, submissionStatus]);

  async function assignCopyeditor() {
    if (!selectedCopyeditor) return;
    setBusy(true);
    try {
      await apiJson(`/submissions/${submissionSlug}/copyedit-assignments`, {
        method: "POST",
        body: JSON.stringify({ copyeditorId: selectedCopyeditor }),
      });
      toast.success(t("assigned"));
      setSelectedCopyeditor("");
      onReload();
      await load();
    } catch (err) {
      toastApiError(err, t("assignFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function markReady(assignmentSlug: string) {
    setBusy(true);
    try {
      await apiJson(`/copyedit-assignments/${assignmentSlug}/ready`, {
        method: "POST",
      });
      toast.success(t("markedReady"));
      onReload();
      await load();
    } catch (err) {
      toastApiError(err, t("readyFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadRevision(file: File) {
    if (fileExceedsUploadLimit(file)) {
      toast.error(t("fileTooLarge", { maxMb: String(MAX_UPLOAD_MB) }));
      return;
    }
    setUploading(true);
    try {
      await apiUpload(`/submissions/${submissionSlug}/files`, file, {
        kind: "manuscript",
      });
      toast.success(t("revisionUploaded"));
      onReload();
    } catch (err) {
      toastApiError(err, t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  if (!isAuthor && !isEditor) return null;
  if (
    submissionStatus !== "copyediting" &&
    submissionStatus !== "accepted"
  ) {
    return null;
  }

  const notesByAssignment = new Map<string, CopyeditNoteRow[]>();
  for (const n of notes) {
    const key = n.assignmentId;
    const list = notesByAssignment.get(key) ?? [];
    list.push(n);
    notesByAssignment.set(key, list);
  }

  return (
    <section className="mt-8 rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm">
      <h2 className="font-sans text-lg font-semibold text-ink">{t("title")}</h2>

      {isEditor && submissionStatus === "accepted" && canAssign && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label className="text-sm font-medium text-ink" htmlFor="copyeditor-pick">
              {t("assignLabel")}
            </label>
            <SearchableSelect
              options={candidates.map((c) => ({
                value: c.id,
                label: `${c.displayName} (${c.email})`,
              }))}
              value={selectedCopyeditor}
              onValueChange={setSelectedCopyeditor}
              placeholder={t("assignPlaceholder")}
              searchPlaceholder={t("assignPlaceholder")}
              emptyText={t("assignPlaceholder")}
            />
          </div>
          <button
            type="button"
            disabled={busy || !selectedCopyeditor}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void assignCopyeditor()}
          >
            {t("assignButton")}
          </button>
        </div>
      )}

      {isEditor && assignments.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm text-ink/80">
          {assignments.map((a) => (
            <li key={a.id}>
              {a.copyeditor?.displayName ?? a.copyeditor?.email ?? a.id}
              <span
                className={`ms-2 ${statusPillClass(a.status)}`}
              >
                {t(`assignmentStatus_${a.status}` as "assignmentStatus_active")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {isAuthor && submissionStatus === "copyediting" && (
        <>
          {notes.length === 0 ? (
            <p className="mt-3 text-sm text-ink/65">{t("noNotesYet")}</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-ink/10 bg-surface p-4"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
                    {t("roundLabel", { round: String(n.round) })}
                    {n.copyeditor?.displayName
                      ? ` · ${n.copyeditor.displayName}`
                      : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                    {n.noteForAuthor}
                  </p>
                  {n.assignmentSlug && n.assignmentStatus === "awaiting_author" && (
                    <button
                      type="button"
                      disabled={busy}
                      className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => void markReady(n.assignmentSlug!)}
                    >
                      {t("markReady")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <label className="text-sm font-medium text-ink">
              {t("uploadRevision")}
            </label>
            <input
              type="file"
              className="mt-2 block w-full text-sm"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadRevision(f);
                e.target.value = "";
              }}
            />
            <p className="mt-1 text-xs text-ink/55">{t("uploadRevisionHint")}</p>
          </div>
        </>
      )}

      {isEditor && submissionStatus === "copyediting" && notes.length > 0 && (
        <ul className="mt-4 space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-ink/10 bg-surface p-3 text-sm"
            >
              <p className="text-xs text-ink/50">
                {t("roundLabel", { round: String(n.round) })}
              </p>
              <p className="mt-1 font-medium">{n.noteForAuthor}</p>
              {n.noteToEditorOnly ? (
                <p className="mt-2 text-ink/70">
                  <span className="font-medium">{t("editorOnly")}: </span>
                  {n.noteToEditorOnly}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
