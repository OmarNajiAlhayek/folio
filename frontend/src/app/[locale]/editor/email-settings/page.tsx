"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { apiJson, ApiError } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { toast } from "@/lib/toast";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { useToastApiError } from "@/lib/use-toast-api-error";
import { PERMISSION_SLUGS } from "@/lib/permissions";
import { submissionQueueShellCls } from "@/lib/submission-list-ui";

type ReminderPolicy = {
  id: number;
  reviewDueInDays: number;
  updatedAt: string;
};

type EmailTemplate = {
  templateKey: string;
  locale: string;
  subjectTemplate: string;
  htmlBody: string;
  textBody: string;
  updatedAt: string;
};

const REVIEW_TEMPLATE_KEYS = [
  "reviewer-invited",
  "reminder-due",
] as const;

const WORKFLOW_TEMPLATE_KEYS = [
  "submission-submitted",
  "submission-decision",
] as const;

const COPYEDIT_TEMPLATE_KEYS = [
  "copyedit-assigned",
  "copyedit-queries-sent",
  "copyedit-author-ready",
] as const;

type EmailTemplateKey =
  | (typeof REVIEW_TEMPLATE_KEYS)[number]
  | (typeof WORKFLOW_TEMPLATE_KEYS)[number]
  | (typeof COPYEDIT_TEMPLATE_KEYS)[number];

const TEMPLATE_I18N: Record<
  EmailTemplateKey,
  { title: string; variables: string; showOverduePreview?: boolean }
> = {
  "reviewer-invited": {
    title: "templateReviewerInvited",
    variables: "variablesReviewer",
  },
  "reminder-due": {
    title: "templateReminderDue",
    variables: "variablesReminder",
    showOverduePreview: true,
  },
  "submission-submitted": {
    title: "templateSubmissionSubmitted",
    variables: "variablesSubmissionSubmitted",
  },
  "submission-decision": {
    title: "templateSubmissionDecision",
    variables: "variablesSubmissionDecision",
  },
  "copyedit-assigned": {
    title: "templateCopyeditAssigned",
    variables: "variablesCopyeditAssigned",
  },
  "copyedit-queries-sent": {
    title: "templateCopyeditQueriesSent",
    variables: "variablesCopyeditQueriesSent",
  },
  "copyedit-author-ready": {
    title: "templateCopyeditAuthorReady",
    variables: "variablesCopyeditAuthorReady",
  },
};

type PipelineStatus = {
  outbox: {
    pending: number;
    dead: number;
    published: number;
    dueNow: number;
    oldestPending: {
      id: string;
      routingKey: string;
      attempts: number;
      createdAt: string;
    } | null;
    deadSample: Array<{
      id: string;
      routingKey: string;
      attempts: number;
      createdAt: string;
      lastErrorRedacted: string | null;
    }>;
  };
  emailLog: {
    counts: { pending: number; sent: number; failed: number };
    failedSample: Array<{
      id: string;
      idempotencyKey: string;
      template: string;
      createdAt: string;
      errorRedacted: string | null;
    }>;
  };
  reminders: {
    counts: { pending: number; sent: number; cancelled: number };
    stuckPendingPastDue: number;
  };
  rabbitMq: {
    metricsAvailable: true;
    cachedAt: string;
    staleAfterSeconds: number;
    available: boolean;
    error?: string;
    queues: Record<string, { messageCount: number; consumerCount: number }>;
  };
};

export default function EmailSettingsPage() {
  const t = useTranslations("EmailSettings");
  const locale = useLocale();
  const meQuery = useMe();
  const me = meQuery.data;
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ReminderPolicy | null>(null);
  const [policyDays, setPolicyDays] = useState("");
  const [templates, setTemplates] = useState<
    Partial<Record<EmailTemplateKey, EmailTemplate>>
  >({});
  /** Match site locale on first paint so the initial GET uses the correct ?locale= */
  const [editTemplateLocale, setEditTemplateLocale] = useState<"en" | "ar">(
    () => (locale === "ar" ? "ar" : "en"),
  );
  const [busyPolicy, setBusyPolicy] = useState(false);
  const [busyTemplateKey, setBusyTemplateKey] =
    useState<EmailTemplateKey | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [requeueOutboxId, setRequeueOutboxId] = useState<string | null>(null);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const showApiError = useToastApiError();

  const loadAll = useCallback(async () => {
    const q = `?locale=${encodeURIComponent(editTemplateLocale)}`;
    const allKeys: EmailTemplateKey[] = [
      ...REVIEW_TEMPLATE_KEYS,
      ...WORKFLOW_TEMPLATE_KEYS,
      ...COPYEDIT_TEMPLATE_KEYS,
    ];
    const [p, ...loaded] = await Promise.all([
      apiJson<ReminderPolicy>("/admin/email/reminder-policy"),
      ...allKeys.map((key) =>
        apiJson<EmailTemplate>(
          `/admin/email/templates/${encodeURIComponent(key)}${q}`,
        ),
      ),
    ]);
    setPolicy(p);
    setPolicyDays(String(p.reviewDueInDays));
    const next: Partial<Record<EmailTemplateKey, EmailTemplate>> = {};
    allKeys.forEach((key, i) => {
      next[key] = loaded[i];
    });
    setTemplates(next);
  }, [editTemplateLocale]);

  function patchTemplate(
    key: EmailTemplateKey,
    patch: Partial<Pick<EmailTemplate, "subjectTemplate" | "htmlBody" | "textBody">>,
  ) {
    setTemplates((prev) => {
      const tpl = prev[key];
      if (!tpl) return prev;
      return { ...prev, [key]: { ...tpl, ...patch } };
    });
  }

  const loadPipeline = useCallback(async () => {
    setPipelineLoading(true);
    setPipelineError(null);
    try {
      const p = await apiJson<PipelineStatus>(
        "/admin/email/pipeline-status",
      );
      setPipeline(p);
    } catch (err) {
      setPipelineError(resolveApiError(err, t("pipelineFailed")));
    } finally {
      setPipelineLoading(false);
    }
  }, [t, resolveApiError]);

  const requeueDeadOutbox = useCallback(
    async (id: string) => {
      setRequeueOutboxId(id);
      try {
        await apiJson(`/admin/email/outbox/${encodeURIComponent(id)}/requeue`, {
          method: "POST",
        });
        toast.success(t("requeueOutboxOk"));
        await loadPipeline();
      } catch (err) {
        showApiError(err, t("requeueOutboxFailed"));
      } finally {
        setRequeueOutboxId(null);
      }
    },
    [loadPipeline, t],
  );

  useEffect(() => {
    if (
      !me?.permissions.includes(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([loadAll(), loadPipeline()]);
      } catch (err) {
        if (cancelled) return;
        setError(resolveApiError(err, t("loadFailed")));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, loadAll, loadPipeline, t]);

  useEffect(() => {
    setEditTemplateLocale(locale === "ar" ? "ar" : "en");
  }, [locale]);

  async function savePolicy() {
    if (!policy) return;
    const n = parseInt(policyDays, 10);
    if (!Number.isFinite(n) || n < 4) return;
    setBusyPolicy(true);
    try {
      const next = await apiJson<ReminderPolicy>(
        "/admin/email/reminder-policy",
        {
          method: "PATCH",
          body: JSON.stringify({
            reviewDueInDays: n,
            expectedUpdatedAt: policy.updatedAt,
          }),
        },
      );
      setPolicy(next);
      setPolicyDays(String(next.reviewDueInDays));
      toast.success(t("policySaved"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(t("conflict"), { id: "email-settings-conflict" });
        await loadAll().catch(() => undefined);
      } else {
        showApiError(err, t("loadFailed"), { id: "email-settings-policy-save" });
      }
    } finally {
      setBusyPolicy(false);
    }
  }

  async function saveTemplate(key: EmailTemplateKey) {
    const tpl = templates[key];
    if (!tpl) return;
    setBusyTemplateKey(key);
    try {
      const next = await apiJson<EmailTemplate>(
        `/admin/email/templates/${encodeURIComponent(key)}?locale=${encodeURIComponent(editTemplateLocale)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            subjectTemplate: tpl.subjectTemplate,
            htmlBody: tpl.htmlBody,
            textBody: tpl.textBody,
            expectedUpdatedAt: tpl.updatedAt,
          }),
        },
      );
      setTemplates((prev) => ({ ...prev, [key]: next }));
      toast.success(t("templateSaved"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(t("conflict"), { id: "email-settings-conflict" });
        await loadAll().catch(() => undefined);
      } else {
        showApiError(err, t("loadFailed"), {
          id: `email-settings-template-${key}`,
        });
      }
    } finally {
      setBusyTemplateKey(null);
    }
  }

  async function preview(key: EmailTemplateKey, isOverdue?: boolean) {
    const body =
      key === "reminder-due" && typeof isOverdue === "boolean"
        ? JSON.stringify({ isOverdue })
        : "{}";
    const q = `?locale=${encodeURIComponent(editTemplateLocale)}`;
    return apiJson<{ subject: string; html: string; text: string }>(
      `/admin/email/templates/${encodeURIComponent(key)}/preview${q}`,
      { method: "POST", body },
    );
  }

  if (error && !policy) {
    return (
      <main className={submissionQueueShellCls}>
        <p className="text-red-700" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="mt-3 rounded-lg border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5"
          onClick={() => {
            setError(null);
            void Promise.all([
              loadAll().catch((err) => {
                setError(resolveApiError(err, t("loadFailed")));
              }),
              loadPipeline(),
            ]);
          }}
        >
          {t("retryLoad")}
        </button>
      </main>
    );
  }

  return (
    <main className={submissionQueueShellCls}>
      <header className="border-s-4 border-s-accent/35 ps-5">
        <p className="text-sm text-ink/65">
          <Link href="/editor" className="text-accent hover:underline">
            {t("backToEditor")}
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/70">
          {t("hint")}
        </p>
      </header>

      <section className="mt-8 rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-sans text-lg font-semibold text-ink">
            {t("pipelineSection")}
          </h2>
          <button
            type="button"
            disabled={pipelineLoading}
            onClick={() => void loadPipeline()}
            className="rounded-lg border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            {pipelineLoading ? t("pipelineLoading") : t("pipelineRefresh")}
          </button>
        </div>
        <p className="mt-2 text-sm text-ink/65">{t("pipelineHint")}</p>
        {pipelineError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {pipelineError}
          </p>
        ) : null}
        {pipelineLoading && !pipeline ? (
          <p className="mt-3 text-sm text-ink/60">{t("pipelineLoading")}</p>
        ) : null}
        {pipeline ? (
          <div
            className="mt-4 grid gap-6 text-sm md:grid-cols-2"
            dir="ltr"
          >
            <div>
              <h3 className="font-medium text-ink">{t("outboxLabel")}</h3>
              <ul className="mt-2 space-y-1 text-ink/80">
                <li>pending: {pipeline.outbox.pending}</li>
                <li>dueNow: {pipeline.outbox.dueNow}</li>
                <li>dead: {pipeline.outbox.dead}</li>
                <li>published: {pipeline.outbox.published}</li>
              </ul>
              {pipeline.outbox.deadSample.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-ink/70">
                    {t("deadOutboxSamples")}
                  </p>
                  <ul className="mt-1 max-h-48 space-y-2 overflow-auto font-mono text-xs text-ink/75">
                    {pipeline.outbox.deadSample.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>
                          {r.routingKey} · {r.lastErrorRedacted ?? "—"}
                        </span>
                        <button
                          type="button"
                          className="rounded border border-ink/20 px-2 py-0.5 font-sans text-xs text-ink hover:bg-ink/5 disabled:opacity-50"
                          disabled={requeueOutboxId === r.id}
                          onClick={() => void requeueDeadOutbox(r.id)}
                        >
                          {requeueOutboxId === r.id
                            ? t("requeueOutboxBusy")
                            : t("requeueOutbox")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div>
              <h3 className="font-medium text-ink">{t("emailLogLabel")}</h3>
              <ul className="mt-2 space-y-1 text-ink/80">
                <li>pending: {pipeline.emailLog.counts.pending}</li>
                <li>sent: {pipeline.emailLog.counts.sent}</li>
                <li>failed: {pipeline.emailLog.counts.failed}</li>
              </ul>
              {pipeline.emailLog.failedSample.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-ink/70">
                    {t("failedSamples")}
                  </p>
                  <ul className="mt-1 max-h-32 space-y-1 overflow-auto font-mono text-xs text-ink/75">
                    {pipeline.emailLog.failedSample.map((r) => (
                      <li key={r.id}>
                        {r.idempotencyKey} · {r.errorRedacted ?? "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div>
              <h3 className="font-medium text-ink">{t("remindersLabel")}</h3>
              <ul className="mt-2 space-y-1 text-ink/80">
                <li>pending: {pipeline.reminders.counts.pending}</li>
                <li>sent: {pipeline.reminders.counts.sent}</li>
                <li>cancelled: {pipeline.reminders.counts.cancelled}</li>
                <li>
                  {t("stuckReminders")}:{" "}
                  {pipeline.reminders.stuckPendingPastDue}
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-ink">{t("rabbitLabel")}</h3>
              {!pipeline.rabbitMq.available ? (
                <p className="mt-2 text-ink/75">
                  {t("rabbitUnavailable")}
                  {pipeline.rabbitMq.error
                    ? ` — ${pipeline.rabbitMq.error}`
                    : ""}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-ink/80">
                  {Object.entries(pipeline.rabbitMq.queues).map(
                    ([name, q]) => (
                      <li key={name}>
                        {name}: msg {q.messageCount}, consumers{" "}
                        {q.consumerCount}
                      </li>
                    ),
                  )}
                </ul>
              )}
              <p className="mt-2 text-xs text-ink/55">
                cached {pipeline.rabbitMq.cachedAt} · refresh ≤{" "}
                {pipeline.rabbitMq.staleAfterSeconds}s
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-10 rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm">
        <h2 className="font-sans text-lg font-semibold text-ink">
          {t("policySection")}
        </h2>
        <p className="mt-2 text-sm text-ink/65">{t("reviewDueDaysHelp")}</p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            <span>{t("reviewDueDays")}</span>
            <input
              type="number"
              min={4}
              max={3650}
              value={policyDays}
              onChange={(e) => setPolicyDays(e.target.value)}
              className="w-32 rounded-md border border-ink/15 bg-paper px-3 py-2 text-ink"
            />
          </label>
          <button
            type="button"
            disabled={
              busyPolicy ||
              !policy ||
              !Number.isFinite(parseInt(policyDays, 10)) ||
              parseInt(policyDays, 10) < 4
            }
            onClick={() => void savePolicy()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90 disabled:opacity-50"
          >
            {busyPolicy ? t("saving") : t("savePolicy")}
          </button>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">{t("templateLocale")}</span>
        <div className="inline-flex rounded-lg border border-ink/15 p-0.5">
          <button
            type="button"
            onClick={() => setEditTemplateLocale("en")}
            className={`rounded-md px-3 py-1.5 text-sm ${
              editTemplateLocale === "en"
                ? "bg-accent text-white"
                : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setEditTemplateLocale("ar")}
            className={`rounded-md px-3 py-1.5 text-sm ${
              editTemplateLocale === "ar"
                ? "bg-accent text-white"
                : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            العربية
          </button>
        </div>
      </div>

      <h2 className="mt-10 font-sans text-base font-semibold uppercase tracking-wide text-ink/60">
        {t("templatesReviewSection")}
      </h2>
      {REVIEW_TEMPLATE_KEYS.map((key) => (
        <EmailTemplateEditorSection
          key={key}
          templateKey={key}
          tpl={templates[key]}
          meta={TEMPLATE_I18N[key]}
          locale={locale}
          busy={busyTemplateKey === key}
          t={t}
          onPatch={(patch) => patchTemplate(key, patch)}
          onSave={() => void saveTemplate(key)}
          onPreview={() => preview(key)}
          onPreviewOverdue={
            TEMPLATE_I18N[key].showOverduePreview
              ? () => preview(key, true)
              : undefined
          }
        />
      ))}

      <h2 className="mt-10 font-sans text-base font-semibold uppercase tracking-wide text-ink/60">
        {t("templatesWorkflowSection")}
      </h2>
      {WORKFLOW_TEMPLATE_KEYS.map((key) => (
        <EmailTemplateEditorSection
          key={key}
          templateKey={key}
          tpl={templates[key]}
          meta={TEMPLATE_I18N[key]}
          locale={locale}
          busy={busyTemplateKey === key}
          t={t}
          onPatch={(patch) => patchTemplate(key, patch)}
          onSave={() => void saveTemplate(key)}
          onPreview={() => preview(key)}
        />
      ))}

      <h2 className="mt-10 font-sans text-base font-semibold uppercase tracking-wide text-ink/60">
        {t("templatesCopyeditSection")}
      </h2>
      {COPYEDIT_TEMPLATE_KEYS.map((key) => (
        <EmailTemplateEditorSection
          key={key}
          templateKey={key}
          tpl={templates[key]}
          meta={TEMPLATE_I18N[key]}
          locale={locale}
          busy={busyTemplateKey === key}
          t={t}
          onPatch={(patch) => patchTemplate(key, patch)}
          onSave={() => void saveTemplate(key)}
          onPreview={() => preview(key)}
        />
      ))}
    </main>
  );
}

function EmailTemplateEditorSection({
  templateKey,
  tpl,
  meta,
  locale,
  busy,
  t,
  onPatch,
  onSave,
  onPreview,
  onPreviewOverdue,
}: {
  templateKey: EmailTemplateKey;
  tpl: EmailTemplate | undefined;
  meta: (typeof TEMPLATE_I18N)[EmailTemplateKey];
  locale: string;
  busy: boolean;
  t: (key: string) => string;
  onPatch: (
    patch: Partial<
      Pick<EmailTemplate, "subjectTemplate" | "htmlBody" | "textBody">
    >,
  ) => void;
  onSave: () => void;
  onPreview: () => Promise<{ subject: string; html: string; text: string }>;
  onPreviewOverdue?: () => Promise<{
    subject: string;
    html: string;
    text: string;
  }>;
}) {
  if (!tpl) return null;

  return (
    <section
      className="mt-8 rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm"
      data-template-key={templateKey}
    >
      <h2 className="font-sans text-lg font-semibold text-ink">
        {t(meta.title)}
      </h2>
      <p className="mt-2 text-xs text-ink/55">{t(meta.variables)}</p>
      <TemplateFields
        locale={locale}
        subject={tpl.subjectTemplate}
        html={tpl.htmlBody}
        text={tpl.textBody}
        onSubject={(v) => onPatch({ subjectTemplate: v })}
        onHtml={(v) => onPatch({ htmlBody: v })}
        onText={(v) => onPatch({ textBody: v })}
        onSave={onSave}
        onPreview={onPreview}
        onPreviewOverdue={onPreviewOverdue}
        busy={busy}
        t={t}
        showOverduePreview={meta.showOverduePreview}
      />
    </section>
  );
}

function TemplateFields({
  subject,
  html,
  text,
  onSubject,
  onHtml,
  onText,
  onSave,
  onPreview,
  onPreviewOverdue,
  busy,
  t,
  locale,
  showOverduePreview,
}: {
  subject: string;
  html: string;
  text: string;
  onSubject: (v: string) => void;
  onHtml: (v: string) => void;
  onText: (v: string) => void;
  onSave: () => void;
  onPreview: () => Promise<{ subject: string; html: string; text: string }>;
  onPreviewOverdue?: () => Promise<{
    subject: string;
    html: string;
    text: string;
  }>;
  busy: boolean;
  t: (key: string) => string;
  locale: string;
  showOverduePreview?: boolean;
}) {
  const tEmail = useTranslations("EmailSettings");
  const showApiError = useToastApiError();
  const [pv, setPv] = useState<string | null>(null);
  const [pvBusy, setPvBusy] = useState(false);

  async function runPreview(
    fn: () => Promise<{ subject: string; html: string; text: string }>,
  ) {
    setPvBusy(true);
    setPv(null);
    try {
      const r = await fn();
      setPv(
        `Subject: ${r.subject}\n\n--- HTML ---\n${r.html}\n\n--- Text ---\n${r.text}`,
      );
    } catch (err) {
      // user-facing: template preview failed
      showApiError(err, tEmail("previewFailed"), { id: "email-settings-preview" });
      setPv(null);
    } finally {
      setPvBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        <span>{t("subject")}</span>
        <input
          dir="ltr"
          value={subject}
          onChange={(e) => onSubject(e.target.value)}
          className="rounded-md border border-ink/15 bg-paper px-3 py-2 font-mono text-sm text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        <span>{t("htmlBody")}</span>
        <textarea
          dir="ltr"
          value={html}
          onChange={(e) => onHtml(e.target.value)}
          rows={12}
          className="rounded-md border border-ink/15 bg-paper px-3 py-2 font-mono text-xs text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        <span>{t("textBody")}</span>
        <textarea
          dir="ltr"
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={8}
          className="rounded-md border border-ink/15 bg-paper px-3 py-2 font-mono text-xs text-ink"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
        >
          {busy ? t("saving") : t("saveTemplate")}
        </button>
        <button
          type="button"
          disabled={pvBusy}
          onClick={() => void runPreview(onPreview)}
          className="rounded-lg border border-ink/20 bg-paper px-4 py-2 text-sm text-ink hover:bg-ink/5"
        >
          {pvBusy ? t("previewing") : t("preview")}
        </button>
        {showOverduePreview && onPreviewOverdue && (
          <button
            type="button"
            disabled={pvBusy}
            onClick={() => void runPreview(onPreviewOverdue)}
            className="rounded-lg border border-ink/20 bg-paper px-4 py-2 text-sm text-ink hover:bg-ink/5"
          >
            {t("previewOverdue")}
          </button>
        )}
      </div>
      {pv && (
        <pre
          dir="ltr"
          className="max-h-96 overflow-auto rounded-md border border-ink/10 bg-ink/[0.03] p-3 text-xs text-ink"
          lang={locale === "ar" ? "ar" : "en"}
        >
          {pv}
        </pre>
      )}
    </div>
  );
}
