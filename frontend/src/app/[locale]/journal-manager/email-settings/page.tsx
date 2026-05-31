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
import { LoadingCenter, Spinner } from "@/components/ui/spinner";

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
  "submission-published",
] as const;

const REVIEW_EDITOR_TEMPLATE_KEYS = [
  "review-submitted",
  "review-invitation-accepted",
  "review-invitation-declined",
] as const;

const ROLE_TEMPLATE_KEYS = ["role-invitation"] as const;

const COPYEDIT_TEMPLATE_KEYS = [
  "copyedit-assigned",
  "copyedit-queries-sent",
  "copyedit-author-ready",
] as const;

type EmailTemplateKey =
  | (typeof REVIEW_TEMPLATE_KEYS)[number]
  | (typeof WORKFLOW_TEMPLATE_KEYS)[number]
  | (typeof REVIEW_EDITOR_TEMPLATE_KEYS)[number]
  | (typeof ROLE_TEMPLATE_KEYS)[number]
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
  "submission-published": {
    title: "templateSubmissionPublished",
    variables: "variablesSubmissionPublished",
  },
  "review-submitted": {
    title: "templateReviewSubmitted",
    variables: "variablesReviewEditor",
  },
  "review-invitation-accepted": {
    title: "templateReviewAccepted",
    variables: "variablesReviewEditor",
  },
  "review-invitation-declined": {
    title: "templateReviewDeclined",
    variables: "variablesReviewEditor",
  },
  "role-invitation": {
    title: "templateRoleInvitation",
    variables: "variablesRoleInvitation",
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
  const [dlqReplayBusy, setDlqReplayBusy] = useState(false);
  const [dlqReplayLimit, setDlqReplayLimit] = useState("1");
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const { resolve: resolveApiError } = useApiErrorMessages();
  const showApiError = useToastApiError();

  // Premium UI Interactive states
  const [activeTab, setActiveTab] = useState<"pipeline" | "policy" | "templates">("pipeline");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<EmailTemplateKey>("reviewer-invited");
  const [editorMode, setEditorMode] = useState<"html" | "text">("html");
  const [previewData, setPreviewData] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOverdue, setPreviewOverdue] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const loadPolicy = useCallback(async () => {
    const p = await apiJson<ReminderPolicy>("/admin/email/reminder-policy");
    setPolicy(p);
    setPolicyDays(String(p.reviewDueInDays));
  }, []);

  const loadTemplates = useCallback(async (templateLocale: "en" | "ar") => {
    const q = `?locale=${encodeURIComponent(templateLocale)}`;
    const allKeys: EmailTemplateKey[] = [
      ...REVIEW_TEMPLATE_KEYS,
      ...WORKFLOW_TEMPLATE_KEYS,
      ...REVIEW_EDITOR_TEMPLATE_KEYS,
      ...ROLE_TEMPLATE_KEYS,
      ...COPYEDIT_TEMPLATE_KEYS,
    ];
    const loaded = await Promise.all(
      allKeys.map((key) =>
        apiJson<EmailTemplate>(
          `/admin/email/templates/${encodeURIComponent(key)}${q}`,
        ),
      ),
    );
    const next: Partial<Record<EmailTemplateKey, EmailTemplate>> = {};
    allKeys.forEach((key, i) => {
      next[key] = loaded[i];
    });
    setTemplates(next);
  }, []);

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
    [loadPipeline, t, showApiError],
  );

  const replayDlq = useCallback(async () => {
    const limit = Math.min(25, Math.max(1, parseInt(dlqReplayLimit, 10) || 1));
    setDlqReplayBusy(true);
    try {
      const res = await apiJson<{
        requested: number;
        replayed: number;
        empty: boolean;
        items: Array<{ routingKey: string; replayed: boolean; error?: string }>;
      }>("/admin/email/dlq/replay", {
        method: "POST",
        body: JSON.stringify({ limit }),
      });
      if (res.empty) {
        toast.info(t("replayDlqEmpty"), { id: "email-dlq-replay" });
      } else if (res.replayed === res.requested) {
        toast.success(t("replayDlqOk", { count: res.replayed }), {
          id: "email-dlq-replay",
        });
      } else if (res.replayed > 0) {
        toast.success(
          t("replayDlqPartial", { ok: res.replayed, total: res.items.length }),
          { id: "email-dlq-replay" },
        );
      } else {
        const firstErr = res.items.find((i) => i.error)?.error;
        showApiError(
          new Error(firstErr ?? "replay failed"),
          t("replayDlqFailed"),
          { id: "email-dlq-replay" },
        );
      }
      await loadPipeline();
    } catch (err) {
      showApiError(err, t("replayDlqFailed"), { id: "email-dlq-replay" });
    } finally {
      setDlqReplayBusy(false);
    }
  }, [dlqReplayLimit, loadPipeline, t, showApiError]);

  useEffect(() => {
    if (
      !me?.permissions.includes(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([loadPolicy(), loadPipeline()]);
      } catch (err) {
        if (cancelled) return;
        setError(resolveApiError(err, t("loadFailed")));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, loadPolicy, loadPipeline, t, resolveApiError]);

  useEffect(() => {
    if (
      !me?.permissions.includes(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
    ) {
      return;
    }
    let cancelled = false;
    setTemplatesLoading(true);
    void loadTemplates(editTemplateLocale)
      .catch((err) => {
        if (cancelled) return;
        showApiError(err, t("loadFailed"), { id: "email-settings-templates" });
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me, editTemplateLocale, loadTemplates, t, showApiError]);

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
        await loadTemplates(editTemplateLocale).catch(() => undefined);
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
      void triggerPreview(key);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(t("conflict"), { id: "email-settings-conflict" });
        await loadTemplates(editTemplateLocale).catch(() => undefined);
      } else {
        showApiError(err, t("loadFailed"), {
          id: `email-settings-template-${key}`,
        });
      }
    } finally {
      setBusyTemplateKey(null);
    }
  }

  const triggerPreview = useCallback(async (key: EmailTemplateKey = selectedTemplateKey) => {
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const isOverdue = key === "reminder-due" ? previewOverdue : undefined;
      const body =
        key === "reminder-due" && typeof isOverdue === "boolean"
          ? JSON.stringify({ isOverdue })
          : "{}";
      const q = `?locale=${encodeURIComponent(editTemplateLocale)}`;
      const res = await apiJson<{ subject: string; html: string; text: string }>(
        `/admin/email/templates/${encodeURIComponent(key)}/preview${q}`,
        { method: "POST", body },
      );
      setPreviewData(res);
    } catch (err) {
      showApiError(err, t("previewFailed"), { id: "email-settings-preview" });
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedTemplateKey, editTemplateLocale, previewOverdue, showApiError, t]);

  useEffect(() => {
    if (activeTab === "templates" && me?.permissions.includes(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)) {
      void triggerPreview(selectedTemplateKey);
    }
  }, [selectedTemplateKey, editTemplateLocale, previewOverdue, activeTab, triggerPreview, me]);

  const handleCopyVar = (variable: string) => {
    navigator.clipboard.writeText(`{{${variable}}}`);
    setCopiedVar(variable);
    toast.success(`Copied {{${variable}}} to clipboard!`);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const TEMPLATE_VARIABLES: Record<EmailTemplateKey, string[]> = {
    "reviewer-invited": ["reviewerDisplayName", "submissionTitle", "acceptUrl", "declineUrl"],
    "reminder-due": ["reviewerDisplayName", "submissionTitle", "assignmentUrl", "dueAt", "isOverdue"],
    "submission-submitted": ["editorDisplayName", "authorDisplayName", "submissionTitle", "isResubmission", "editorQueueUrl"],
    "submission-decision": ["authorDisplayName", "submissionTitle", "submissionUrl", "decidedByDisplayName", "isAccepted", "isRejected", "isRevisionsRequested"],
    "copyedit-assigned": ["copyeditorDisplayName", "submissionTitle", "workbenchUrl", "assignedByDisplayName"],
    "copyedit-queries-sent": ["authorDisplayName", "copyeditorDisplayName", "submissionTitle", "round", "noteExcerpt", "submissionUrl"],
    "copyedit-author-ready": ["copyeditorDisplayName", "authorDisplayName", "submissionTitle", "round", "workbenchUrl"],
  };

  if (error && !policy) {
    return (
      <main className={submissionQueueShellCls}>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/40 dark:bg-red-950/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-red-300 bg-paper px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
            onClick={() => {
              setError(null);
              void Promise.all([
                loadPolicy().catch((err) => {
                  setError(resolveApiError(err, t("loadFailed")));
                }),
                loadTemplates(editTemplateLocale).catch((err) => {
                  setError(resolveApiError(err, t("loadFailed")));
                }),
                loadPipeline(),
              ]);
            }}
          >
            {t("retryLoad")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`${submissionQueueShellCls} max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8`}>
      {/* Premium Header */}
      <header className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface/50 p-6 md:p-8 shadow-sm backdrop-blur-md">
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 size-48 rounded-full bg-accent-2/5 blur-3xl" />
        <div className="relative z-10 space-y-2">
          <p className="text-xs font-semibold tracking-wider uppercase text-accent">
            <Link href="/dashboard" className="inline-flex items-center gap-1 hover:underline transition">
              <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              {t("backToDashboard")}
            </Link>
          </p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight text-ink">
            {t("title")}
          </h1>
          <p className="max-w-4xl text-sm leading-relaxed text-ink/70">
            {t("hint")}
          </p>
        </div>
      </header>

      {/* Modern High-Fidelity Interactive Navigation Tabs */}
      <div className="flex border-b border-border/80 p-0.5 space-x-1 sm:space-x-2 overflow-x-auto" dir={locale === "ar" ? "rtl" : "ltr"}>
        <button
          type="button"
          onClick={() => setActiveTab("pipeline")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-t-xl transition-all duration-300 border-b-2 focus:outline-none cursor-pointer ${
            activeTab === "pipeline"
              ? "border-accent text-accent bg-surface/40 shadow-sm"
              : "border-transparent text-ink/60 hover:text-ink hover:bg-ink/5"
          }`}
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
          </svg>
          {t("pipelineSection")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("policy")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-t-xl transition-all duration-300 border-b-2 focus:outline-none cursor-pointer ${
            activeTab === "policy"
              ? "border-accent text-accent bg-surface/40 shadow-sm"
              : "border-transparent text-ink/60 hover:text-ink hover:bg-ink/5"
          }`}
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          {t("policySection")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-t-xl transition-all duration-300 border-b-2 focus:outline-none cursor-pointer ${
            activeTab === "templates"
              ? "border-accent text-accent bg-surface/40 shadow-sm"
              : "border-transparent text-ink/60 hover:text-ink hover:bg-ink/5"
          }`}
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {t("templatesReviewSection")}
        </button>
      </div>

      {/* Tab 1: Operational Pipeline Dashboard */}
      {activeTab === "pipeline" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink">{t("pipelineSection")}</h2>
              <p className="text-xs text-ink/60 mt-1">{t("pipelineHint")}</p>
            </div>
            <button
              type="button"
              disabled={pipelineLoading}
              onClick={() => void loadPipeline()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-surface border border-border/80 hover:bg-ink/5 transition disabled:opacity-50 cursor-pointer"
            >
              {pipelineLoading ? (
                <Spinner size="sm" />
              ) : (
                <svg className="size-4 text-ink/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.228 10H18.228" />
                </svg>
              )}
              {t("pipelineRefresh")}
            </button>
          </div>

          {pipelineError && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 text-xs font-semibold text-red-600 dark:border-red-900/40 dark:bg-red-950/10">
              {pipelineError}
            </div>
          )}

          {pipelineLoading && !pipeline ? (
            <div className="flex flex-col items-center justify-center p-12 bg-surface/30 rounded-2xl border border-border/60">
              <LoadingCenter label={t("pipelineLoading")} className="text-ink/60" compact />
            </div>
          ) : pipeline ? (
            <div className="grid gap-6">
              {/* Status Metric Cards Grid */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {/* Outbox Card */}
                <div className="relative group overflow-hidden rounded-2xl border border-border/60 bg-surface/50 p-6 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="absolute -right-4 -bottom-4 size-24 rounded-full bg-accent/5 group-hover:scale-125 transition-transform duration-500" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink/60 uppercase tracking-wide">{t("outboxLabel")}</h3>
                    <span className={`size-2.5 rounded-full ${pipeline.outbox.dead > 0 ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <p className="text-2xl font-semibold tracking-tight text-ink">{pipeline.outbox.pending}</p>
                      <p className="text-xs text-ink/50">Pending</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-2xl font-semibold tracking-tight text-ink">{pipeline.outbox.dueNow}</p>
                      <p className="text-xs text-ink/50">Due Now</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className={`text-2xl font-semibold tracking-tight ${pipeline.outbox.dead > 0 ? "text-red-500 font-bold" : "text-ink"}`}>{pipeline.outbox.dead}</p>
                      <p className="text-xs text-ink/50">Dead</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-2xl font-semibold tracking-tight text-ink">{pipeline.outbox.published}</p>
                      <p className="text-xs text-ink/50">Published</p>
                    </div>
                  </div>
                </div>

                {/* Email Send Log Card */}
                <div className="relative group overflow-hidden rounded-2xl border border-border/60 bg-surface/50 p-6 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="absolute -right-4 -bottom-4 size-24 rounded-full bg-accent-2/5 group-hover:scale-125 transition-transform duration-500" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink/60 uppercase tracking-wide">{t("emailLogLabel")}</h3>
                    <span className={`size-2.5 rounded-full ${pipeline.emailLog.counts.failed > 0 ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="space-y-0.5">
                      <p className="text-2xl font-semibold tracking-tight text-ink">{pipeline.emailLog.counts.pending}</p>
                      <p className="text-[10px] text-ink/50 uppercase tracking-wider">Pending</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">{pipeline.emailLog.counts.sent}</p>
                      <p className="text-[10px] text-ink/50 uppercase tracking-wider">Sent</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className={`text-2xl font-semibold tracking-tight ${pipeline.emailLog.counts.failed > 0 ? "text-red-500 font-bold" : "text-ink"}`}>{pipeline.emailLog.counts.failed}</p>
                      <p className="text-[10px] text-ink/50 uppercase tracking-wider">Failed</p>
                    </div>
                  </div>
                </div>

                {/* Reminders Summary Card */}
                <div className="relative group overflow-hidden rounded-2xl border border-border/60 bg-surface/50 p-6 shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="absolute -right-4 -bottom-4 size-24 rounded-full bg-accent/5 group-hover:scale-125 transition-transform duration-500" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink/60 uppercase tracking-wide">{t("remindersLabel")}</h3>
                    <span className={`size-2.5 rounded-full ${pipeline.reminders.stuckPendingPastDue > 0 ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <p className="text-2xl font-semibold tracking-tight text-ink">{pipeline.reminders.counts.pending}</p>
                      <p className="text-xs text-ink/50">Pending</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-2xl font-semibold tracking-tight text-ink">{pipeline.reminders.counts.sent}</p>
                      <p className="text-xs text-ink/50">Sent</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-2xl font-semibold tracking-tight text-ink">{pipeline.reminders.counts.cancelled}</p>
                      <p className="text-xs text-ink/50">Cancelled</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className={`text-2xl font-semibold tracking-tight ${pipeline.reminders.stuckPendingPastDue > 0 ? "text-red-500 font-bold" : "text-ink"}`}>{pipeline.reminders.stuckPendingPastDue}</p>
                      <p className="text-xs text-ink/50">{t("stuckReminders")}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* RabbitMQ Queues switchboard & DLQ Manager */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* RabbitMQ Status Card */}
                <div className="rounded-2xl border border-border/60 bg-surface/50 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-ink mb-3 flex items-center gap-2">
                    <svg className="size-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    {t("rabbitLabel")}
                  </h3>
                  {!pipeline.rabbitMq.available ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50/50 border border-red-100 text-xs font-semibold text-red-700 dark:bg-red-950/10 dark:border-red-900/30">
                      <span className="size-2 rounded-full bg-red-500 animate-ping" />
                      <span>
                        {t("rabbitUnavailable")}
                        {pipeline.rabbitMq.error ? ` — ${pipeline.rabbitMq.error}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="overflow-hidden border border-border/80 rounded-xl bg-surface/30">
                      <table className="min-w-full divide-y divide-border/80 text-left text-xs text-ink/80 font-mono">
                        <thead className="bg-ink/[0.02] text-xs font-bold text-ink/60 uppercase">
                          <tr>
                            <th className="px-4 py-3 font-sans">Queue Name</th>
                            <th className="px-4 py-3 text-right font-sans">Messages</th>
                            <th className="px-4 py-3 text-right font-sans">Consumers</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/80 bg-transparent">
                          {Object.entries(pipeline.rabbitMq.queues).map(([name, q]) => (
                            <tr key={name} className="hover:bg-ink/[0.01] transition-colors">
                              <td className={`px-4 py-3 font-medium ${name.includes("dlq") ? "text-accent-2" : ""}`}>
                                {name}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-ink">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] ${q.messageCount > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" : "bg-ink/5"}`}>
                                  {q.messageCount}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-ink/65 flex items-center justify-end gap-1.5 font-bold">
                                {q.consumerCount > 0 && <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />}
                                <span>{q.consumerCount}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-3 text-[10px] text-ink/50 text-right">
                    cached {pipeline.rabbitMq.cachedAt} · refresh ≤ {pipeline.rabbitMq.staleAfterSeconds}s
                  </p>
                </div>

                {/* DLQ Manager */}
                <div className="rounded-2xl border border-warning/30 bg-warning/[0.02] p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-warning flex items-center gap-2">
                        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {t("dlqLabel")}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning">DLQ System</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-ink/75">
                      {t("dlqHint")}
                    </p>
                  </div>

                  <div className="mt-6 p-4 rounded-xl border border-warning/20 bg-warning/5 space-y-4">
                    <div className="flex flex-wrap items-end gap-4 justify-between">
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
                        <span>{t("replayDlqLimit")}</span>
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={dlqReplayLimit}
                          onChange={(e) => setDlqReplayLimit(e.target.value)}
                          disabled={dlqReplayBusy || !pipeline.rabbitMq.available}
                          className="w-24 rounded-lg border border-border/80 bg-paper px-3 py-2 text-sm text-ink focus:ring-1 focus:ring-accent focus:border-accent"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={dlqReplayBusy || !pipeline.rabbitMq.available}
                        onClick={() => void replayDlq()}
                        className="inline-flex min-w-[9rem] items-center justify-center rounded-lg border border-warning/30 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-warning/10 transition-all duration-200 disabled:opacity-50 cursor-pointer"
                      >
                        {dlqReplayBusy ? (
                          <Spinner size="sm" />
                        ) : (
                          <>
                            <svg className="size-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.228 10H18.228" />
                            </svg>
                            {t("replayDlq")}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Terminal Log Console */}
              <div className="rounded-2xl border border-border/80 overflow-hidden shadow-sm">
                {/* Terminal Header */}
                <div className="bg-[#1e2430] border-b border-[#2e3440] px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="size-2.5 rounded-full bg-red-500/80 inline-block" />
                    <span className="size-2.5 rounded-full bg-yellow-500/80 inline-block" />
                    <span className="size-2.5 rounded-full bg-green-500/80 inline-block" />
                    <span className="text-xs font-mono font-bold text-[#b4be82] pl-2">email_pipeline.log</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#5c6370]">sh · active terminal console</span>
                </div>
                {/* Terminal Screen */}
                <div className="bg-[#0f141c] text-[#a6acb9] font-mono text-xs p-5 max-h-96 overflow-y-auto space-y-4">
                  {pipeline.outbox.deadSample.length === 0 && pipeline.emailLog.failedSample.length === 0 ? (
                    <div className="text-center py-8 text-[#5c6370] space-y-1">
                      <p>&gt; SYSTEM STATUS STABLE: SMTP PIPELINE DRAINED</p>
                      <p className="text-[10px]">&gt; No fatal socket drops or outbox retry loops recorded.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pipeline.outbox.deadSample.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[#e06c75] font-bold">&gt; dead_outbox_sample_stream.stdout</p>
                          <ul className="divide-y divide-ink/10 space-y-2">
                            {pipeline.outbox.deadSample.map((r) => (
                              <li key={r.id} className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs bg-red-950/20 p-3 rounded-lg border border-red-900/30">
                                <div className="space-y-1 max-w-[80%]">
                                  <p className="text-[#df6b74] font-bold">
                                    [ATTEMPT {r.attempts}] Key: {r.routingKey}
                                  </p>
                                  <p className="text-ink/65 text-[10px] break-all leading-normal">
                                    Error: {r.lastErrorRedacted ?? "Unknown protocol exception."}
                                  </p>
                                  <p className="text-[10px] text-ink/40">Timestamp: {new Date(r.createdAt).toLocaleString()}</p>
                                </div>
                                <button
                                  type="button"
                                  disabled={requeueOutboxId === r.id}
                                  onClick={() => void requeueDeadOutbox(r.id)}
                                  className="inline-flex min-w-[5.5rem] items-center justify-center rounded border border-[#df6b74] bg-transparent px-3 py-1 font-sans text-xs text-[#df6b74] hover:bg-[#df6b74] hover:text-white transition duration-200 disabled:opacity-50 cursor-pointer"
                                >
                                  {requeueOutboxId === r.id ? <Spinner size="sm" /> : t("requeueOutbox")}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {pipeline.emailLog.failedSample.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[#d19a66] font-bold">&gt; recent_smtp_failures.stdout</p>
                          <ul className="space-y-2">
                            {pipeline.emailLog.failedSample.map((r) => (
                              <li key={r.id} className="text-xs bg-[#171c24] p-3 rounded-lg border border-border/10 leading-normal">
                                <p className="text-[#d19a66] font-bold">[FAILED SMTP SEND] IdempotencyKey: {r.idempotencyKey.slice(0, 16)}...</p>
                                <p className="text-ink/70 text-[10px] mt-1 break-all">Error: {r.errorRedacted ?? "Broker connection timed out."}</p>
                                <p className="text-[10px] text-ink/40 mt-0.5">Template: {r.template} · Timestamp: {new Date(r.createdAt).toLocaleString()}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 2: Policy Settings & Interactive Timeline */}
      {activeTab === "policy" && (
        <div className="space-y-8 animate-fadeIn max-w-4xl mx-auto">
          <div className="rounded-2xl border border-border/60 bg-surface/50 p-6 md:p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
              <svg className="size-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              {t("policySection")}
            </h2>
            <p className="text-sm text-ink/65 mt-2 leading-relaxed">{t("reviewDueDaysHelp")}</p>
            
            <div className="mt-6 flex flex-wrap items-end gap-6 p-5 rounded-xl bg-surface/30 border border-border/80">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
                <span>{t("reviewDueDays")}</span>
                <input
                  type="number"
                  min={4}
                  max={3650}
                  value={policyDays}
                  onChange={(e) => setPolicyDays(e.target.value)}
                  className="w-36 rounded-lg border border-border/80 bg-paper px-4 py-2.5 text-ink font-bold focus:ring-1 focus:ring-accent focus:border-accent"
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
                className="inline-flex min-w-[8rem] items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent/90 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 cursor-pointer"
              >
                {busyPolicy ? (
                  <Spinner size="sm" className="border-ink/30 border-t-white" />
                ) : (
                  t("savePolicy")
                )}
              </button>
            </div>

            {/* Interactive horizontal timeline chart */}
            {(() => {
              const parsedDays = parseInt(policyDays, 10);
              const nVal = Number.isFinite(parsedDays) && parsedDays >= 4 ? parsedDays : 10;
              const dueSoonDays = nVal - 3;
              const overdueDays = nVal + 1;

               return (
                <div className="mt-10 border-t border-border/80 pt-10">
                  <h3 className="text-base font-semibold text-ink mb-2">{t("timelineTitle")}</h3>
                  <p className="text-xs text-ink/65 mb-8">
                    {t("timelineHint", { n: nVal })}
                  </p>

                  <div className="relative flex flex-col md:flex-row items-center md:items-start justify-between gap-8 md:gap-4 px-4">
                    {/* Desktop Connector Line */}
                    <div className="absolute top-[26px] left-[10%] right-[10%] h-0.5 bg-border/80 hidden md:block" />

                    {/* Step 1: Invited (Day 0) */}
                    <div className="relative flex flex-row md:flex-col items-center gap-4 md:gap-3 text-left md:text-center max-w-xs z-10 w-full md:w-1/4 group">
                      <div className="size-12 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-600 flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-110 transition duration-300">
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-ink/60 uppercase tracking-wider">{t("dayCount", { d: 0 })}</h4>
                        <p className="text-sm font-semibold text-ink mt-0.5">{t("timelineStepInvitedTitle")}</p>
                        <p className="text-[11px] text-ink/60 mt-1 max-w-[200px] leading-relaxed mx-auto">
                          {t("timelineStepInvitedDesc")}
                        </p>
                      </div>
                    </div>

                    {/* Step 2: Due Soon (Day N - 3) */}
                    <div className="relative flex flex-row md:flex-col items-center gap-4 md:gap-3 text-left md:text-center max-w-xs z-10 w-full md:w-1/4 group">
                      <div className="size-12 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-600 flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-110 transition duration-300">
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider">{t("dayCount", { d: dueSoonDays })}</h4>
                        <p className="text-sm font-semibold text-ink mt-0.5">{t("timelineStepDueSoonTitle")}</p>
                        <p className="text-[11px] text-ink/60 mt-1 max-w-[200px] leading-relaxed mx-auto">
                          {t("timelineStepDueSoonDesc")}
                        </p>
                      </div>
                    </div>

                    {/* Step 3: Due Date (Day N) */}
                    <div className="relative flex flex-row md:flex-col items-center gap-4 md:gap-3 text-left md:text-center max-w-xs z-10 w-full md:w-1/4 group">
                      <div className="size-12 rounded-full bg-accent/10 border border-accent/40 text-accent flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-110 transition duration-300">
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider">{t("dayCount", { d: nVal })}</h4>
                        <p className="text-sm font-semibold text-ink mt-0.5">{t("timelineStepDueTitle")}</p>
                        <p className="text-[11px] text-ink/60 mt-1 max-w-[200px] leading-relaxed mx-auto">
                          {t("timelineStepDueDesc")}
                        </p>
                      </div>
                    </div>

                    {/* Step 4: Overdue (Day N + 1) */}
                    <div className="relative flex flex-row md:flex-col items-center gap-4 md:gap-3 text-left md:text-center max-w-xs z-10 w-full md:w-1/4 group">
                      <div className="size-12 rounded-full bg-red-500/10 border border-red-500/40 text-red-600 flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-110 transition duration-300 relative">
                        <span className="absolute inset-0 rounded-full bg-red-500/10 animate-ping opacity-60" />
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider">{t("dayCount", { d: overdueDays })}</h4>
                        <p className="text-sm font-semibold text-ink mt-0.5">{t("timelineStepOverdueTitle")}</p>
                        <p className="text-[11px] text-ink/60 mt-1 max-w-[200px] leading-relaxed mx-auto">
                          {t("timelineStepOverdueDesc")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Tab 3: Template Workspace split-pane */}
      {activeTab === "templates" && (
        <div className="grid gap-8 lg:grid-cols-12 animate-fadeIn items-start">
          {/* Left Column: Sidebar selection (3 cols) */}
          <div className="lg:col-span-3 space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {/* Template Language Selector Card */}
            <div className="p-3 bg-surface/50 border border-border/60 rounded-xl space-y-2 shadow-sm">
              <span className="text-[10px] font-bold text-ink/60 uppercase tracking-wider block">
                {t("templateLocale")}
              </span>
              <div className="grid grid-cols-2 rounded-lg border border-border/80 p-0.5 bg-paper/60">
                <button
                  type="button"
                  disabled={templatesLoading}
                  onClick={() => setEditTemplateLocale("en")}
                  className={`rounded-md py-1.5 text-xs font-semibold transition cursor-pointer ${
                    editTemplateLocale === "en"
                      ? "bg-accent text-white shadow-sm"
                      : "text-ink/75 hover:bg-ink/5"
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  disabled={templatesLoading}
                  onClick={() => setEditTemplateLocale("ar")}
                  className={`rounded-md py-1.5 text-xs font-semibold transition cursor-pointer ${
                    editTemplateLocale === "ar"
                      ? "bg-accent text-white shadow-sm"
                      : "text-ink/75 hover:bg-ink/5"
                  }`}
                >
                  العربية
                </button>
              </div>
            </div>

            {/* Sidebar list items */}
            <div className="space-y-5">
              {/* Category: Peer Review */}
              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-accent uppercase tracking-widest px-2">
                  {t("templatesReviewSection")}
                </h3>
                <div className="space-y-1">
                  {REVIEW_TEMPLATE_KEYS.map((key) => {
                    const meta = TEMPLATE_I18N[key];
                    const isSelected = selectedTemplateKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={templatesLoading}
                        onClick={() => setSelectedTemplateKey(key)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-surface border-accent shadow-sm text-accent"
                            : "bg-surface/35 border-transparent text-ink/80 hover:bg-ink/5 hover:text-ink"
                        }`}
                      >
                        <span className="truncate">{t(meta.title)}</span>
                        <span className="size-1.5 rounded-full bg-accent/40" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category: Editorial Workflow */}
              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-accent-2 uppercase tracking-widest px-2">
                  {t("templatesWorkflowSection")}
                </h3>
                <div className="space-y-1">
                  {WORKFLOW_TEMPLATE_KEYS.map((key) => {
                    const meta = TEMPLATE_I18N[key];
                    const isSelected = selectedTemplateKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={templatesLoading}
                        onClick={() => setSelectedTemplateKey(key)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-surface border-accent-2 shadow-sm text-accent-2"
                            : "bg-surface/35 border-transparent text-ink/80 hover:bg-ink/5 hover:text-ink"
                        }`}
                      >
                        <span className="truncate">{t(meta.title)}</span>
                        <span className="size-1.5 rounded-full bg-accent-2/40" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-accent-2 uppercase tracking-widest px-2">
                  {t("templatesReviewEditorSection")}
                </h3>
                <div className="space-y-1">
                  {REVIEW_EDITOR_TEMPLATE_KEYS.map((key) => {
                    const meta = TEMPLATE_I18N[key];
                    const isSelected = selectedTemplateKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={templatesLoading}
                        onClick={() => setSelectedTemplateKey(key)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-surface border-accent-2 shadow-sm text-accent-2"
                            : "bg-surface/35 border-transparent text-ink/80 hover:bg-ink/5 hover:text-ink"
                        }`}
                      >
                        <span className="truncate">{t(meta.title)}</span>
                        <span className="size-1.5 rounded-full bg-accent-2/40" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-accent uppercase tracking-widest px-2">
                  {t("templatesRoleSection")}
                </h3>
                <div className="space-y-1">
                  {ROLE_TEMPLATE_KEYS.map((key) => {
                    const meta = TEMPLATE_I18N[key];
                    const isSelected = selectedTemplateKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={templatesLoading}
                        onClick={() => setSelectedTemplateKey(key)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-surface border-accent shadow-sm text-accent"
                            : "bg-surface/35 border-transparent text-ink/80 hover:bg-ink/5 hover:text-ink"
                        }`}
                      >
                        <span className="truncate">{t(meta.title)}</span>
                        <span className="size-1.5 rounded-full bg-accent/40" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category: Copyediting */}
              <div className="space-y-1.5">
                <h3 className="text-[10px] font-bold text-accent uppercase tracking-widest px-2">
                  {t("templatesCopyeditSection")}
                </h3>
                <div className="space-y-1">
                  {COPYEDIT_TEMPLATE_KEYS.map((key) => {
                    const meta = TEMPLATE_I18N[key];
                    const isSelected = selectedTemplateKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={templatesLoading}
                        onClick={() => setSelectedTemplateKey(key)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-surface border-accent shadow-sm text-accent"
                            : "bg-surface/35 border-transparent text-ink/80 hover:bg-ink/5 hover:text-ink"
                        }`}
                      >
                        <span className="truncate">{t(meta.title)}</span>
                        <span className="size-1.5 rounded-full bg-accent/40" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Components: Workspace Editor (5 cols) & Live Preview (4 cols) */}
          {(() => {
            const activeTemplate = templates[selectedTemplateKey];
            const activeMeta = TEMPLATE_I18N[selectedTemplateKey];
            const variables = TEMPLATE_VARIABLES[selectedTemplateKey] || [];

            if (templatesLoading) {
              return (
                <div className="lg:col-span-9 flex flex-col items-center justify-center p-24 bg-surface/30 rounded-2xl border border-border/60">
                  <Spinner size="lg" aria-label={t("templatesLoading")} />
                  <p className="mt-4 text-xs font-semibold text-ink/50">{t("templatesLoading")}</p>
                </div>
              );
            }

            if (!activeTemplate) {
              return (
                <div className="lg:col-span-9 flex items-center justify-center p-12 text-ink/50 text-xs">
                  No active template loaded.
                </div>
              );
            }

            return (
              <>
                {/* Center Column: Editor Panel (5 cols) */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-surface/50 p-6 shadow-sm space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">
                        {t(activeMeta.title)}
                      </h3>
                      <p className="text-[10px] text-ink/50 mt-1 uppercase font-bold tracking-wider">
                        Language: {editTemplateLocale} · Edit Session
                      </p>
                    </div>

                    {/* Subject Line */}
                    <label className="flex flex-col gap-1.5 text-xs font-bold text-ink">
                      <span>{t("subject")}</span>
                      <input
                        dir="ltr"
                        value={activeTemplate.subjectTemplate}
                        onChange={(e) => patchTemplate(selectedTemplateKey, { subjectTemplate: e.target.value })}
                        className="rounded-lg border border-border/80 bg-paper px-3 py-2.5 font-mono text-xs text-ink focus:ring-1 focus:ring-accent focus:border-accent"
                      />
                    </label>

                    {/* Body Editors with tabs */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-border/80 pb-1.5">
                        <span className="text-xs font-bold text-ink">Body Templates</span>
                        <div className="flex border border-border/80 rounded-md p-0.5 bg-paper/60 text-xs">
                          <button
                            type="button"
                            onClick={() => setEditorMode("html")}
                            className={`px-3 py-1 rounded-sm font-semibold transition cursor-pointer ${
                              editorMode === "html"
                                ? "bg-surface shadow-sm text-accent"
                                : "text-ink/65 hover:text-ink"
                            }`}
                          >
                            HTML Body
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditorMode("text")}
                            className={`px-3 py-1 rounded-sm font-semibold transition cursor-pointer ${
                              editorMode === "text"
                                ? "bg-surface shadow-sm text-accent"
                                : "text-ink/65 hover:text-ink"
                            }`}
                          >
                            Plain Text
                          </button>
                        </div>
                      </div>

                      {editorMode === "html" ? (
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink">
                          <span className="sr-only">{t("htmlBody")}</span>
                          <textarea
                            dir="ltr"
                            value={activeTemplate.htmlBody}
                            onChange={(e) => patchTemplate(selectedTemplateKey, { htmlBody: e.target.value })}
                            rows={12}
                            className="rounded-lg border border-border/80 bg-paper px-3 py-2.5 font-mono text-xs text-ink focus:ring-1 focus:ring-accent focus:border-accent resize-y min-h-[250px] leading-normal"
                          />
                        </label>
                      ) : (
                        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink">
                          <span className="sr-only">{t("textBody")}</span>
                          <textarea
                            dir="ltr"
                            value={activeTemplate.textBody}
                            onChange={(e) => patchTemplate(selectedTemplateKey, { textBody: e.target.value })}
                            rows={12}
                            className="rounded-lg border border-border/80 bg-paper px-3 py-2.5 font-mono text-xs text-ink focus:ring-1 focus:ring-accent focus:border-accent resize-y min-h-[250px] leading-normal"
                          />
                        </label>
                      )}
                    </div>

                    {/* Copyable pill helpers */}
                    <div className="space-y-2 border-t border-border/60 pt-4">
                      <span className="text-[10px] font-bold text-ink/60 uppercase tracking-wider block">
                        Template Variables (Click to copy)
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {variables.map((variable) => {
                          const isCopied = copiedVar === variable;
                          return (
                            <button
                              key={variable}
                              type="button"
                              onClick={() => handleCopyVar(variable)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono border transition cursor-pointer ${
                                isCopied
                                  ? "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400"
                                  : "bg-surface border-border/80 text-ink hover:border-accent/40 hover:text-accent"
                              }`}
                            >
                              {isCopied ? (
                                <>
                                  <svg className="size-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                  Copied
                                </>
                              ) : (
                                `{{${variable}}}`
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Actions footer */}
                    <div className="flex items-center gap-3 border-t border-border/60 pt-4">
                      <button
                        type="button"
                        disabled={busyTemplateKey === selectedTemplateKey}
                        onClick={() => void saveTemplate(selectedTemplateKey)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-accent/90 transition-all duration-150 disabled:opacity-50 cursor-pointer"
                      >
                        {busyTemplateKey === selectedTemplateKey ? (
                          <Spinner size="sm" className="border-ink/30 border-t-white" />
                        ) : (
                          <>
                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            {t("saveTemplate")}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={previewLoading}
                        onClick={() => void triggerPreview(selectedTemplateKey)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-paper px-4 py-2.5 text-xs font-bold text-ink hover:bg-ink/5 transition-all duration-150 cursor-pointer"
                      >
                        {previewLoading ? (
                          <Spinner size="sm" />
                        ) : (
                          <>
                            <svg className="size-3.5 text-ink/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.228 10H18.228" />
                            </svg>
                            Refresh
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: macOS Mail Client Mockup Preview (4 cols) */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="rounded-2xl border border-border/80 overflow-hidden shadow-lg bg-surface/80 backdrop-blur flex flex-col min-h-[480px]">
                    {/* Window bar */}
                    <div className="bg-[#1e2430] border-b border-[#2e3440] px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="size-2.5 rounded-full bg-[#ff5f56]" />
                        <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
                        <span className="size-2.5 rounded-full bg-[#27c93f]" />
                      </div>
                      <span className="text-[10px] font-sans font-bold text-[#b4be82] tracking-wider uppercase">
                        Email Client Mockup
                      </span>
                      <span className="w-10" />
                    </div>

                    {/* Email Headers */}
                    <div className="bg-surface/30 p-4 border-b border-border/60 text-xs font-sans space-y-1.5">
                      <div className="flex text-ink/50">
                        <span className="w-12 font-bold uppercase tracking-wider text-[10px]">From:</span>
                        <span className="text-ink/80 font-semibold font-mono">Folio Systems &lt;noreply@journal.folio&gt;</span>
                      </div>
                      <div className="flex text-ink/50">
                        <span className="w-12 font-bold uppercase tracking-wider text-[10px]">To:</span>
                        <span className="text-ink/80 font-semibold">Recipient &lt;user@domain.org&gt;</span>
                      </div>
                      <div className="flex text-ink/50 items-start">
                        <span className="w-12 font-bold uppercase tracking-wider text-[10px] mt-0.5">Subject:</span>
                        <span className="text-ink font-bold flex-1">
                          {previewLoading ? (
                            <span className="text-ink/30 italic animate-pulse">Compiling subject...</span>
                          ) : previewData ? (
                            previewData.subject
                          ) : (
                            "No subject compiled."
                          )}
                        </span>
                      </div>

                      {/* Overdue Branch switcher for due soon vs overdue */}
                      {selectedTemplateKey === "reminder-due" && activeMeta.showOverduePreview && (
                        <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-2">
                          <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
                            Previewing Branch: {previewOverdue ? "Overdue" : "Due Soon"}
                          </span>
                          <button
                            type="button"
                            disabled={previewLoading}
                            onClick={() => setPreviewOverdue((prev) => !prev)}
                            className="px-2.5 py-0.5 rounded text-[9px] font-bold bg-accent/15 text-accent hover:bg-accent/25 transition cursor-pointer"
                          >
                            Toggle Branch
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Email body preview inside safe iframe sandbox */}
                    <div className="flex-1 bg-white dark:bg-[#121118] p-4 overflow-y-auto text-xs min-h-[300px] flex flex-col">
                      {previewLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-ink/40 text-xs italic gap-2 py-10">
                          <Spinner size="sm" />
                          <span>Rendering template compiler...</span>
                        </div>
                      ) : previewData ? (
                        editorMode === "html" ? (
                          <iframe
                            srcDoc={previewData.html}
                            title="Live HTML Render"
                            sandbox="allow-same-origin"
                            className="w-full flex-1 border-0 min-h-[280px]"
                          />
                        ) : (
                          <pre
                            dir="ltr"
                            className="w-full flex-1 whitespace-pre-wrap font-mono text-[11px] text-ink leading-relaxed"
                          >
                            {previewData.text}
                          </pre>
                        )
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-ink/40 text-center space-y-1.5 py-12">
                          <svg className="size-8 text-ink/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <p className="font-semibold text-xs text-ink/55">No compiled preview.</p>
                          <p className="text-[10px] text-ink/40 max-w-[180px]">Change selection or click Refresh to fetch compilation sample.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </main>
  );
}
