"use client";

import type { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PAGE_SHELL, EMPTY_STATE_CLS } from "@/lib/page-shell";

export type SubmissionsListTranslator = ReturnType<
  typeof useTranslations<"Submissions">
>;

export type AssignmentsListTranslator = ReturnType<
  typeof useTranslations<"Assignments">
>;

/** Shared card styling for submission and assignment queue rows */
export const queueRowCardLinkCls =
  "group flex flex-col gap-2.5 rounded-xl border border-ink/10 border-s-4 border-s-accent/25 bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ink/15 hover:border-s-accent/45 hover:shadow-md";

export function statusPillClass(status: string): string {
  const base =
    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums";
  switch (status) {
    case "draft":
      return `${base} bg-ink/10 text-ink/75`;
    case "submitted":
      return `${base} bg-accent/15 text-accent`;
    case "under_review":
      return `${base} bg-amber-100/90 text-amber-950`;
    case "revisions_requested":
      return `${base} bg-orange-100/90 text-orange-950`;
    case "accepted":
      return `${base} bg-emerald-100/90 text-emerald-950`;
    case "copyediting":
      return `${base} bg-violet-100/90 text-violet-950`;
    case "rejected":
      return `${base} bg-rose-100/90 text-rose-950`;
    case "published":
      return `${base} bg-ink/15 text-ink`;
    default:
      return `${base} bg-ink/10 text-ink/70`;
  }
}

export function assignmentStatusPillClass(status: string): string {
  const base =
    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums";
  switch (status) {
    case "invited":
      return `${base} bg-sky-100/90 text-sky-950`;
    case "accepted":
      return `${base} bg-amber-100/90 text-amber-950`;
    case "completed":
      return `${base} bg-emerald-100/90 text-emerald-950`;
    case "declined":
      return `${base} bg-ink/12 text-ink/70`;
    default:
      return `${base} bg-ink/10 text-ink/70`;
  }
}

export function assignmentStatusLabel(
  status: string,
  t: (
    key:
      | "stAssignInvited"
      | "stAssignAccepted"
      | "stAssignCompleted"
      | "stAssignDeclined",
  ) => string,
): string {
  switch (status) {
    case "invited":
      return t("stAssignInvited");
    case "accepted":
      return t("stAssignAccepted");
    case "completed":
      return t("stAssignCompleted");
    case "declined":
      return t("stAssignDeclined");
    default:
      return status;
  }
}

export function submissionStatusLabel(
  status: string,
  t: (
    key:
      | "stDraft"
      | "stSubmitted"
      | "stUnderReview"
      | "stRevisions"
      | "stAccepted"
      | "stRejected"
      | "stCopyediting"
      | "stPublished",
  ) => string,
): string {
  switch (status) {
    case "draft":
      return t("stDraft");
    case "submitted":
      return t("stSubmitted");
    case "under_review":
      return t("stUnderReview");
    case "revisions_requested":
      return t("stRevisions");
    case "accepted":
      return t("stAccepted");
    case "rejected":
      return t("stRejected");
    case "copyediting":
      return t("stCopyediting");
    case "published":
      return t("stPublished");
    default:
      return status;
  }
}

export function formatSubmissionUpdatedAt(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export { EMPTY_STATE_CLS };

export function SubmissionListSkeleton() {
  return (
    <ul className="mt-6 space-y-3" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <li
          key={i}
          className="animate-pulse rounded-xl border border-ink/10 bg-surface p-4 shadow-sm"
        >
          <div className="h-5 w-3/5 max-w-md rounded bg-ink/10" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="h-4 w-28 rounded bg-ink/10" />
            <div className="h-5 w-24 rounded-full bg-ink/10" />
          </div>
        </li>
      ))}
    </ul>
  );
}

type SubmissionQueueRowProps = {
  href: string;
  title: string;
  status: string;
  updatedAt: string;
  locale: string;
  t: SubmissionsListTranslator;
};

export function SubmissionQueueRow({
  href,
  title,
  status,
  updatedAt,
  locale,
  t,
}: SubmissionQueueRowProps) {
  const label = submissionStatusLabel(status, t);
  const dateStr = formatSubmissionUpdatedAt(updatedAt, locale);
  return (
    <li>
      <Link href={href} className={queueRowCardLinkCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span
            className="min-w-0 flex-1 text-base font-medium text-ink group-hover:text-accent"
            dir="auto"
          >
            {title}
          </span>
          <span className={statusPillClass(status)}>{label}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink/55">
          {dateStr ? (
            <span>{t("updatedLabel", { date: dateStr })}</span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 font-medium text-accent opacity-80 transition group-hover:opacity-100">
            <span className="text-xs font-semibold tracking-wide">
              {t("view")}
            </span>
            <svg
              className="size-4 rtl:rotate-180"
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
          </span>
        </div>
      </Link>
    </li>
  );
}

type AssignmentQueueRowProps = {
  slug: string | null | undefined;
  title: string;
  assignmentStatus: string;
  submissionStatus: string;
  assignedAt?: string;
  locale: string;
  tAssign: AssignmentsListTranslator;
  tSub: SubmissionsListTranslator;
};

function AssignmentQueueRowInner({
  title,
  assignmentStatus,
  submissionStatus,
  assignedAt,
  locale,
  tAssign,
  tSub,
  ctaLabelKey,
  showRowCta,
}: Omit<AssignmentQueueRowProps, "slug"> & {
  showRowCta: boolean;
  ctaLabelKey: "openReview" | "respondToInvite";
}) {
  const assignLabel = assignmentStatusLabel(assignmentStatus, tAssign);
  const subLabel = submissionStatus.trim()
    ? submissionStatusLabel(submissionStatus, tSub)
    : "";
  const dateStr = assignedAt
    ? formatSubmissionUpdatedAt(assignedAt, locale)
    : "";
  const ctaText =
    ctaLabelKey === "respondToInvite"
      ? tAssign("respondToInvite")
      : tAssign("openReview");
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span
          className="min-w-0 flex-1 text-base font-medium text-ink group-hover:text-accent"
          dir="auto"
        >
          {title}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={assignmentStatusPillClass(assignmentStatus)}>
            {assignLabel}
          </span>
          {submissionStatus.trim() ? (
            <span className={statusPillClass(submissionStatus)}>
              {subLabel}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink/55">
        {dateStr ? (
          <span>{tAssign("assignedLabel", { date: dateStr })}</span>
        ) : (
          <span />
        )}
        {showRowCta ? (
          <span className="inline-flex items-center gap-1 font-medium text-accent opacity-80 transition group-hover:opacity-100">
            <span className="text-xs font-semibold tracking-wide">
              {ctaText}
            </span>
            <svg
              className="size-4 rtl:rotate-180"
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
          </span>
        ) : (
          <span />
        )}
      </div>
    </>
  );
}

function assignmentRowLinkPart(status: string): "invite" | "review" | null {
  if (status === "invited") return "invite";
  if (status === "accepted") return "review";
  return null;
}

export function AssignmentQueueRow({
  slug,
  title,
  assignmentStatus,
  submissionStatus,
  assignedAt,
  locale,
  tAssign,
  tSub,
}: AssignmentQueueRowProps) {
  const part = assignmentRowLinkPart(assignmentStatus);
  const rowHref =
    slug?.trim() && part
      ? `/assignments/${encodeURIComponent(slug.trim())}/${part}`
      : null;
  const inner = (
    <AssignmentQueueRowInner
      title={title}
      assignmentStatus={assignmentStatus}
      submissionStatus={submissionStatus}
      assignedAt={assignedAt}
      locale={locale}
      tAssign={tAssign}
      tSub={tSub}
      showRowCta={Boolean(rowHref)}
      ctaLabelKey={part === "invite" ? "respondToInvite" : "openReview"}
    />
  );

  if (rowHref) {
    return (
      <li>
        <Link href={rowHref} className={queueRowCardLinkCls}>
          {inner}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <div
        className="flex flex-col gap-3 rounded-xl border border-ink/10 border-s-4 border-s-accent/25 bg-surface p-5 shadow-sm"
        aria-disabled
      >
        {inner}
      </div>
    </li>
  );
}

export const submissionQueueShellCls = PAGE_SHELL;
