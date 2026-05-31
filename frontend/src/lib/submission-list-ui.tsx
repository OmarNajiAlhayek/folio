"use client";

import type { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PAGE_SHELL, EMPTY_STATE_CLS } from "@/lib/page-shell";
import { useDisciplineLabel } from "@/lib/use-discipline-label";

export type SubmissionsListTranslator = ReturnType<
  typeof useTranslations<"Submissions">
>;

export type AssignmentsListTranslator = ReturnType<
  typeof useTranslations<"Assignments">
>;

/** Shared card styling for submission and assignment queue rows */
export const queueRowCardLinkCls =
  "group flex flex-col gap-2.5 rounded-xl border border-ink/10 dark:border-white/10 border-s-4 border-s-accent/25 bg-surface p-4 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-ink/15 hover:border-s-accent hover:shadow-md";

export function statusPillClass(status: string): string {
  const base =
    "inline-flex items-center shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border tabular-nums";
  switch (status) {
    case "draft":
      return `${base} bg-slate-500/8 border-slate-500/15 text-slate-600 dark:text-slate-400`;
    case "submitted":
      return `${base} bg-indigo-500/8 border-indigo-500/15 text-indigo-600 dark:text-indigo-400`;
    case "under_review":
      return `${base} bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-400`;
    case "revisions_requested":
      return `${base} bg-orange-500/8 border-orange-500/15 text-orange-600 dark:text-orange-400`;
    case "accepted":
      return `${base} bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-400`;
    case "copyediting":
      return `${base} bg-purple-500/8 border-purple-500/15 text-purple-600 dark:text-purple-400`;
    case "rejected":
      return `${base} bg-rose-500/8 border-rose-500/15 text-rose-600 dark:text-rose-400`;
    case "published":
      return `${base} bg-teal-500/8 border-teal-500/15 text-teal-600 dark:text-teal-400`;
    default:
      return `${base} bg-ink/5 border-ink/10 text-ink/70 dark:bg-white/5 dark:border-white/10 dark:text-white/60`;
  }
}

export function assignmentStatusPillClass(status: string): string {
  const base =
    "inline-flex items-center shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border tabular-nums";
  switch (status) {
    case "invited":
      return `${base} bg-sky-500/8 border-sky-500/15 text-sky-600 dark:text-sky-400`;
    case "accepted":
      return `${base} bg-amber-500/8 border-amber-500/15 text-amber-600 dark:text-amber-400`;
    case "completed":
      return `${base} bg-emerald-500/8 border-emerald-500/15 text-emerald-600 dark:text-emerald-400`;
    case "declined":
      return `${base} bg-rose-500/8 border-rose-500/15 text-rose-600 dark:text-rose-400`;
    default:
      return `${base} bg-ink/5 border-ink/10 text-ink/70 dark:bg-white/5 dark:border-white/10 dark:text-white/60`;
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
          className="animate-pulse rounded-xl border border-ink/10 dark:border-white/10 bg-surface p-4 shadow-xs"
        >
          <div className="flex justify-between items-center">
            <div className="h-5 w-3/5 max-w-md rounded bg-ink/10 dark:bg-white/10" />
            <div className="h-5 w-16 rounded-full bg-ink/10 dark:bg-white/10" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="h-4 w-32 rounded bg-ink/10 dark:bg-white/10" />
            <div className="h-4 w-12 rounded bg-ink/10 dark:bg-white/10" />
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
  disciplineSuggested?: string | null;
};

export function SubmissionQueueRow({
  href,
  title,
  status,
  updatedAt,
  locale,
  t,
  disciplineSuggested,
}: SubmissionQueueRowProps) {
  const { format: formatDiscipline } = useDisciplineLabel();
  const label = submissionStatusLabel(status, t);
  const dateStr = formatSubmissionUpdatedAt(updatedAt, locale);
  const disciplineLabel = disciplineSuggested
    ? formatDiscipline(disciplineSuggested)
    : null;
  return (
    <li>
      <Link href={href} className={queueRowCardLinkCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span
            className="min-w-0 flex-1 text-base font-serif font-bold text-ink group-hover:text-accent transition-colors duration-200"
            dir="auto"
          >
            {title}
          </span>
          <span className={statusPillClass(status)}>{label}</span>
        </div>
        
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55 dark:text-white/55">
          <div className="flex flex-col gap-1 min-w-0">
            {dateStr ? (
              <span className="flex items-center gap-1">
                <svg className="size-3.5 text-accent opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008z" />
                </svg>
                {t("updatedLabel", { date: dateStr })}
              </span>
            ) : null}
            
            {disciplineLabel ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/8 dark:bg-emerald-500/18 border border-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-xs" dir="auto" title={disciplineLabel}>
                <span className="size-1 rounded-full bg-emerald-500 animate-pulse" />
                {disciplineLabel}
              </span>
            ) : null}
          </div>

          <span className="inline-flex items-center gap-1 font-semibold text-accent opacity-80 transition group-hover:opacity-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 select-none">
            <span className="text-xs tracking-wide">
              {t("view")}
            </span>
            <svg
              className="size-3.5 rtl:rotate-180"
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
          className="min-w-0 flex-1 text-base font-serif font-bold text-ink group-hover:text-accent transition-colors duration-200"
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55 dark:text-white/55">
        {dateStr ? (
          <span className="flex items-center gap-1">
            <svg className="size-3.5 text-accent opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008z" />
            </svg>
            {tAssign("assignedLabel", { date: dateStr })}
          </span>
        ) : (
          <span />
        )}
        {showRowCta ? (
          <span className="inline-flex items-center gap-1 font-semibold text-accent opacity-80 transition group-hover:opacity-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 select-none">
            <span className="text-xs tracking-wide">
              {ctaText}
            </span>
            <svg
              className="size-3.5 rtl:rotate-180"
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
        className="flex flex-col gap-3 rounded-xl border border-ink/10 dark:border-white/10 border-s-4 border-s-accent/25 bg-surface p-4 shadow-xs"
        aria-disabled
      >
        {inner}
      </div>
    </li>
  );
}

export const submissionQueueShellCls = PAGE_SHELL;
