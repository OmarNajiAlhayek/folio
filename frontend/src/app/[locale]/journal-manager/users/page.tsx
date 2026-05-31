"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ApiErrorState } from "@/components/api-error-state";
import { useMe } from "@/lib/queries/auth";
import {
  createRoleInvitation,
  fetchAdminUsers,
  patchUserRoles,
} from "@/lib/queries/users-admin";
import { toast } from "@/lib/toast";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useToastApiError } from "@/lib/use-toast-api-error";
import { PERMISSION_SLUGS, ROLE_SLUGS } from "@/lib/permissions";
import { submissionQueueShellCls } from "@/lib/submission-list-ui";
import { LoadingCenter, Spinner } from "@/components/ui/spinner";
import {
  createRoleInvitationSchema,
  safeParseResult,
  updateUserRolesSchema,
} from "@/lib/validation";
import type { AdminUserRow } from "@/lib/users-admin";
import {
  hasPendingInvite,
  hasRole,
  withRoleToggle,
} from "@/lib/users-admin";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type RoleLabelKey =
  | "roleAuthor"
  | "roleEditor"
  | "roleJournalManager"
  | "roleReviewer"
  | "roleCopyeditor";

function roleLabelKey(slug: string): RoleLabelKey | null {
  switch (slug) {
    case ROLE_SLUGS.AUTHOR:
      return "roleAuthor";
    case ROLE_SLUGS.EDITOR:
      return "roleEditor";
    case ROLE_SLUGS.JOURNAL_MANAGER:
      return "roleJournalManager";
    case ROLE_SLUGS.REVIEWER:
      return "roleReviewer";
    case ROLE_SLUGS.COPYEDITOR:
      return "roleCopyeditor";
    default:
      return null;
  }
}

export default function JournalManagerUsersPage() {
  const t = useTranslations("JournalManagerUsers");
  const me = useMe();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const showApiError = useToastApiError();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const canAccess = me.data?.permissions.includes(
    PERMISSION_SLUGS.USERS_MANAGE_ROLES,
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    setErrorCause(null);
    try {
      const data = await fetchAdminUsers({
        q: debouncedQ || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setErrorCause(err);
      setError(resolveApiError(err, t("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [canAccess, debouncedQ, offset, resolveApiError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDirectRole(
    row: AdminUserRow,
    roleSlug: string,
    on: boolean,
  ) {
    const next = withRoleToggle(row.roleSlugs, roleSlug, on);
    const parsed = safeParseResult(updateUserRolesSchema, { roleSlugs: next });
    if (!parsed.ok) return;

    setRowBusy(row.id);
    try {
      await patchUserRoles(row.id, parsed.data.roleSlugs);
      setItems((prev) =>
        prev.map((u) =>
          u.id === row.id ? { ...u, roleSlugs: parsed.data.roleSlugs } : u,
        ),
      );
      toast.success(t("rolesSaved"));
    } catch (err) {
      showApiError(err, t("loadFailed"));
    } finally {
      setRowBusy(null);
    }
  }

  async function sendInvite(
    row: AdminUserRow,
    roleSlug: "editor" | "journal_manager",
  ) {
    const parsed = safeParseResult(createRoleInvitationSchema, { roleSlug });
    if (!parsed.ok) return;

    setRowBusy(row.id);
    try {
      await createRoleInvitation(row.id, parsed.data.roleSlug);
      setItems((prev) =>
        prev.map((u) => {
          if (u.id !== row.id) return u;
          if (hasPendingInvite(u, roleSlug)) return u;
          return {
            ...u,
            pendingRoleInvitations: [
              ...u.pendingRoleInvitations,
              { id: `pending-${roleSlug}`, roleSlug },
            ],
          };
        }),
      );
      toast.success(t("inviteSent"));
      void load();
    } catch (err) {
      showApiError(err, t("loadFailed"));
    } finally {
      setRowBusy(null);
    }
  }

  if (me.isPending) {
    return (
      <main className={submissionQueueShellCls}>
        <LoadingCenter label={t("loading")} />
      </main>
    );
  }

  if (!canAccess) {
    return (
      <main className={submissionQueueShellCls}>
        <p className="text-sm text-ink/70">{t("forbidden")}</p>
      </main>
    );
  }

  if (error && items.length === 0 && !loading) {
    return (
      <main className={submissionQueueShellCls}>
        <ApiErrorState
          message={error}
          error={errorCause}
          onRetry={() => void load()}
          retryLabel={t("retryLoad")}
        />
      </main>
    );
  }

  const pageEnd = Math.min(offset + items.length, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <main className={submissionQueueShellCls}>
      <header className="border-s-4 border-s-accent/35 ps-5">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/70">
          {t("hint")}
        </p>
      </header>

      <div className="mt-6">
        <label
          htmlFor="user-admin-search"
          className="text-xs font-semibold uppercase tracking-wider text-ink/50"
        >
          {t("searchLabel")}
        </label>
        <input
          id="user-admin-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="mt-2 w-full max-w-md rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          autoComplete="off"
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="mt-8">
          <LoadingCenter label={t("loading")} />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-ink/10 bg-surface-muted/40 p-8 text-center">
          <p className="font-serif text-base text-ink">{t("empty")}</p>
          <p className="mt-2 text-sm text-ink/65">{t("emptyHint")}</p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-ink/55">
            {t("showingCount", { count: pageEnd, total })}
          </p>
          <ul className="mt-4 space-y-4">
            {items.map((row) => {
              const busy = rowBusy === row.id;
              const editorHas = hasRole(row, ROLE_SLUGS.EDITOR);
              const jmHas = hasRole(row, ROLE_SLUGS.JOURNAL_MANAGER);
              const editorPending = hasPendingInvite(row, ROLE_SLUGS.EDITOR);
              const jmPending = hasPendingInvite(
                row,
                ROLE_SLUGS.JOURNAL_MANAGER,
              );

              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-ink/10 bg-surface p-4 shadow-xs sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-serif text-lg font-semibold text-ink truncate">
                        {row.displayName}
                      </p>
                      <p className="text-sm text-ink/65 break-all">{row.email}</p>
                      {row.affiliation ? (
                        <p className="mt-1 text-xs text-ink/55 truncate">
                          {row.affiliation}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {row.willingToReview ? (
                          <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            {t("willingToReview")}
                          </span>
                        ) : null}
                        {row.roleSlugs.map((slug) => {
                          const key = roleLabelKey(slug);
                          return (
                            <span
                              key={slug}
                              className="inline-flex rounded-full border border-ink/10 bg-surface-muted px-2.5 py-0.5 text-[10px] font-medium text-ink/70"
                            >
                              {key ? t(key) : slug}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 border-t border-ink/8 pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink/45">
                        {t("directRolesHeading")}
                      </p>
                      <div className="mt-2 flex flex-col gap-2">
                        <label className="inline-flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-ink/20"
                            checked={hasRole(row, ROLE_SLUGS.REVIEWER)}
                            disabled={busy}
                            onChange={(e) =>
                              void toggleDirectRole(
                                row,
                                ROLE_SLUGS.REVIEWER,
                                e.target.checked,
                              )
                            }
                          />
                          {busy ? t("saving") : t("toggleReviewer")}
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-ink/20"
                            checked={hasRole(row, ROLE_SLUGS.COPYEDITOR)}
                            disabled={busy}
                            onChange={(e) =>
                              void toggleDirectRole(
                                row,
                                ROLE_SLUGS.COPYEDITOR,
                                e.target.checked,
                              )
                            }
                          />
                          {busy ? t("saving") : t("toggleCopyeditor")}
                        </label>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink/45">
                        {t("inviteHeading")}
                      </p>
                      <div className="mt-2 flex flex-col gap-2">
                        {editorPending ? (
                          <p className="text-xs text-accent">{t("pendingEditorInvite")}</p>
                        ) : null}
                        {jmPending ? (
                          <p className="text-xs text-accent">
                            {t("pendingJournalManagerInvite")}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy || editorHas || editorPending}
                          onClick={() => void sendInvite(row, "editor")}
                          className={cn(
                            "inline-flex items-center justify-center rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium transition",
                            editorHas || editorPending
                              ? "cursor-not-allowed opacity-50"
                              : "hover:bg-ink/5",
                          )}
                        >
                          {editorHas
                            ? t("hasEditorRole")
                            : busy
                              ? t("inviting")
                              : t("inviteEditor")}
                        </button>
                        <button
                          type="button"
                          disabled={busy || jmHas || jmPending}
                          onClick={() =>
                            void sendInvite(row, "journal_manager")
                          }
                          className={cn(
                            "inline-flex items-center justify-center rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium transition",
                            jmHas || jmPending
                              ? "cursor-not-allowed opacity-50"
                              : "hover:bg-ink/5",
                          )}
                        >
                          {jmHas
                            ? t("hasJournalManagerRole")
                            : busy
                              ? t("inviting")
                              : t("inviteJournalManager")}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              {t("prevPage")}
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              {t("nextPage")}
            </button>
          </div>
        </>
      )}

      {loading && items.length > 0 ? (
        <div className="mt-4 flex justify-center">
          <Spinner size="sm" />
        </div>
      ) : null}
    </main>
  );
}
