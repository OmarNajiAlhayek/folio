"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { apiJson } from "@/lib/api";
import { ApiErrorState } from "@/components/api-error-state";
import { useMe } from "@/lib/queries/auth";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useToastApiError } from "@/lib/use-toast-api-error";
import type { MeProfile } from "@/lib/permissions";
import {
  canBrowseSubmissionsNav,
  PERMISSION_SLUGS,
} from "@/lib/permissions";
import { PAGE_SHELL } from "@/lib/page-shell";
import { formatSubmissionUpdatedAt } from "@/lib/submission-list-ui";
function RowChevron() {
  return (
    <svg
      className="size-4 shrink-0 text-ink/35 transition group-hover:text-accent rtl:rotate-180"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

type ReviewInviteRow = {
  id: string;
  slug: string | null;
  status: string;
  assignedAt?: string;
  submission?: { title: string };
};

type RoleInviteRow = {
  id: string;
  roleSlug: string;
  createdAt: string;
  invitedBy: { displayName: string; email: string };
};

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const me = meQuery.data ?? null;
  const [reviewInvites, setReviewInvites] = useState<ReviewInviteRow[]>([]);
  const [roleInvites, setRoleInvites] = useState<RoleInviteRow[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [emailPref, setEmailPref] = useState<"" | "en" | "ar">("");
  const [emailPrefBusy, setEmailPrefBusy] = useState(false);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const tApi = useTranslations("ApiErrors");
  const showApiError = useToastApiError();

  useEffect(() => {
    if (!me) return;
    const p = me.preferredLocale;
    setEmailPref(p === "en" || p === "ar" ? p : "");
  }, [me]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setInvitesLoaded(false);
    const loads: Promise<void>[] = [];

    if (me.permissions.includes(PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN)) {
      loads.push(
        apiJson<ReviewInviteRow[]>("/assignments/me")
          .then((rows) => {
            if (!cancelled) {
              setReviewInvites(rows.filter((r) => r.status === "invited"));
            }
          })
          .catch(() => {
            if (!cancelled) setReviewInvites([]);
          }),
      );
    } else if (!cancelled) {
      setReviewInvites([]);
    }

    loads.push(
      apiJson<RoleInviteRow[]>("/users/me/role-invitations")
        .then((rows) => {
          if (!cancelled) setRoleInvites(rows);
        })
        .catch(() => {
          if (!cancelled) setRoleInvites([]);
        }),
    );

    Promise.all(loads).finally(() => {
      if (!cancelled) setInvitesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [me]);

  async function acceptRoleInvite(id: string) {
    setRoleBusyId(id);
    try {
      await apiJson(`/role-invitations/${id}/accept`, { method: "POST" });
      const [profile, roles] = await Promise.all([
        apiJson<MeProfile>("/auth/me"),
        apiJson<RoleInviteRow[]>("/users/me/role-invitations"),
      ]);
      queryClient.setQueryData(queryKeys.me, profile);
      setRoleInvites(roles);
      toast.success(t("roleInviteAccepted"));
    } catch (err) {
      // user-facing: role invite acceptance failed
      showApiError(err, t("roleInviteAcceptFailed"), {
        id: "dashboard-role-invite-accept",
      });
    } finally {
      setRoleBusyId(null);
    }
  }

  async function declineRoleInvite(id: string) {
    setRoleBusyId(id);
    try {
      await apiJson(`/role-invitations/${id}/decline`, { method: "POST" });
      setRoleInvites(await apiJson<RoleInviteRow[]>("/users/me/role-invitations"));
      toast.success(t("roleInviteDeclined"));
    } catch (err) {
      // user-facing: role invite decline failed
      showApiError(err, t("roleInviteDeclineFailed"), {
        id: "dashboard-role-invite-decline",
      });
    } finally {
      setRoleBusyId(null);
    }
  }

  async function saveEmailPref() {
    setEmailPrefBusy(true);
    try {
      await apiJson("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          preferredLocale: emailPref === "" ? null : emailPref,
        }),
      });
      const profile = await apiJson<MeProfile>("/auth/me");
      queryClient.setQueryData(queryKeys.me, profile);
      toast.success(t("emailLanguageSaved"));
    } catch (err) {
      // user-facing: email preference save failed
      showApiError(err, t("emailLanguageSaveFailed"), {
        id: "dashboard-email-pref",
      });
    } finally {
      setEmailPrefBusy(false);
    }
  }

  if (meQuery.isError) {
    return (
      <ApiErrorState
        className={PAGE_SHELL}
        message={resolveApiError(meQuery.error, t("loadFailed"))}
        error={meQuery.error}
        onRetry={() => void meQuery.refetch()}
        retryLabel={tApi("retry")}
      />
    );
  }

  if (!me) {
    return null;
  }

  const canEditorQueue = me.permissions.includes(
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  );
  const canAssignments = me.permissions.includes(
    PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
  );

  const initial =
    me.displayName?.trim()?.charAt(0)?.toLocaleUpperCase() ?? "?";

  const links: { href: string; label: string }[] = [
    ...(canBrowseSubmissionsNav(me.permissions)
      ? [{ href: "/submissions", label: t("mySubmissions") } as const]
      : []),
    ...(canEditorQueue
      ? [{ href: "/editor", label: t("editorQueue") } as const]
      : []),
    ...(canAssignments
      ? [{ href: "/assignments", label: t("myReviewAssignments") } as const]
      : []),
    { href: "/publications", label: t("publicCatalog") },
  ];

  const hasPendingInvites =
    invitesLoaded &&
    (reviewInvites.length > 0 || roleInvites.length > 0);

  return (
    <main className={PAGE_SHELL}>
      <header className="border-s-4 border-s-accent/70 ps-5">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t("title")}
        </h1>
        <div
          className="mt-4 h-px max-w-xs bg-linear-to-r from-accent/60 to-transparent"
          aria-hidden
        />
      </header>

      <div className="mt-6 rounded-xl border border-ink/10 bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent/12 text-2xl font-semibold text-accent"
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-start">
            <p className="text-xs font-medium text-ink/50">{t("signedInAs")}</p>
            <p className="mt-1.5 text-xl font-semibold text-ink sm:text-2xl">
              {me.displayName}
            </p>
            <p className="mt-1 text-sm text-ink/65">{me.email}</p>
          </div>
        </div>
      </div>

      <section
        className="mt-6 rounded-xl border border-ink/10 bg-surface p-5 shadow-sm sm:p-6"
        aria-labelledby="email-pref-heading"
      >
        <h2
          id="email-pref-heading"
          className="font-sans text-sm font-semibold text-ink"
        >
          {t("emailLanguageTitle")}
        </h2>
        <p className="mt-2 text-sm text-ink/65">{t("emailLanguageHint")}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            <span className="sr-only">{t("emailLanguageTitle")}</span>
            <select
              value={emailPref}
              onChange={(e) =>
                setEmailPref(e.target.value as "" | "en" | "ar")
              }
              className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-ink"
            >
              <option value="">{t("emailLanguageAuto")}</option>
              <option value="en">{t("emailLanguageEn")}</option>
              <option value="ar">{t("emailLanguageAr")}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={emailPrefBusy}
            onClick={() => void saveEmailPref()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
          >
            {emailPrefBusy ? t("emailLanguageSaving") : t("emailLanguageSave")}
          </button>
        </div>
      </section>

      {hasPendingInvites && (
        <section
          className="mt-6 rounded-xl border border-s-4 border-s-accent/35 border-ink/10 bg-surface p-5 shadow-sm sm:p-6"
          aria-labelledby="pending-invites-heading"
        >
          <h2
            id="pending-invites-heading"
            className="font-serif text-xl font-semibold text-ink"
          >
            {t("pendingInvitationsTitle")}
          </h2>
          <p className="mt-2 text-sm text-ink/65">
            {t("pendingInvitationsHint")}
          </p>

          {reviewInvites.length > 0 && (
            <div className="mt-5">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50">
                {t("subsectionReviewInvites")}
              </h3>
              <ul className="mt-3 space-y-2">
                {reviewInvites.map((r) => {
                  const slug = r.slug?.trim();
                  const dateStr = r.assignedAt
                    ? formatSubmissionUpdatedAt(r.assignedAt, locale)
                    : "";
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-surface-muted/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-ink">
                          {r.submission?.title ?? t("untitledSubmission")}
                        </p>
                        {dateStr ? (
                          <p className="mt-1 text-xs text-ink/55">
                            {t("invitedAt", { date: dateStr })}
                          </p>
                        ) : null}
                      </div>
                      {slug ? (
                        <Link
                          href={`/assignments/${encodeURIComponent(slug)}/invite`}
                          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                        >
                          {t("respondToReviewInvite")}
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {roleInvites.length > 0 && (
            <div className="mt-5">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/50">
                {t("subsectionRoleInvites")}
              </h3>
              <ul className="mt-3 space-y-2">
                {roleInvites.map((r) => {
                  const dateStr = formatSubmissionUpdatedAt(
                    r.createdAt,
                    locale,
                  );
                  const busy = roleBusyId === r.id;
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col gap-4 rounded-xl border border-ink/10 bg-surface-muted/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-ink">
                          {r.roleSlug === "editor"
                            ? t("roleInviteEditorLine", {
                                name: r.invitedBy.displayName,
                              })
                            : r.roleSlug === "journal_manager"
                              ? t("roleInviteJournalManagerLine", {
                                  name: r.invitedBy.displayName,
                                })
                              : t("roleInviteGenericLine", {
                                  name: r.invitedBy.displayName,
                                  roleSlug: r.roleSlug,
                                })}
                        </p>
                        <p className="mt-1 text-xs text-ink/55">
                          {t("invitedAt", { date: dateStr })}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void acceptRoleInvite(r.id)}
                          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
                        >
                          {busy ? t("working") : t("acceptRole")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void declineRoleInvite(r.id)}
                          className="rounded-lg border border-ink/20 bg-paper px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
                        >
                          {t("declineRole")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      <nav aria-label={t("title")} className="mt-6">
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="group flex items-center justify-between gap-3 rounded-xl border border-ink/10 border-s-4 border-s-accent/25 bg-surface px-5 py-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-ink/15 hover:border-s-accent/45 hover:shadow-md"
              >
                <span className="font-medium text-ink group-hover:text-accent">
                  {label}
                </span>
                <RowChevron />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
