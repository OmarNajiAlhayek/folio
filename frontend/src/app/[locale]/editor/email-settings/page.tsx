"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { apiJson, getStoredToken, ApiError } from "@/lib/api";
import type { MeProfile } from "@/lib/permissions";
import { PERMISSION_SLUGS } from "@/lib/permissions";
import { submissionQueueShellCls } from "@/lib/submission-list-ui";

type ReminderPolicy = {
  id: number;
  reviewDueInDays: number;
  updatedAt: string;
};

type EmailTemplate = {
  templateKey: string;
  subjectTemplate: string;
  htmlBody: string;
  textBody: string;
  updatedAt: string;
};

export default function EmailSettingsPage() {
  const t = useTranslations("EmailSettings");
  const locale = useLocale();
  const router = useRouter();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ReminderPolicy | null>(null);
  const [policyDays, setPolicyDays] = useState("");
  const [tplRi, setTplRi] = useState<EmailTemplate | null>(null);
  const [tplRd, setTplRd] = useState<EmailTemplate | null>(null);
  const [busyPolicy, setBusyPolicy] = useState(false);
  const [busyRi, setBusyRi] = useState(false);
  const [busyRd, setBusyRd] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const subjectRi = tplRi?.subjectTemplate ?? "";
  const htmlRi = tplRi?.htmlBody ?? "";
  const textRi = tplRi?.textBody ?? "";
  const subjectRd = tplRd?.subjectTemplate ?? "";
  const htmlRd = tplRd?.htmlBody ?? "";
  const textRd = tplRd?.textBody ?? "";

  const loadAll = useCallback(async () => {
    const [p, a, b] = await Promise.all([
      apiJson<ReminderPolicy>("/admin/email/reminder-policy"),
      apiJson<EmailTemplate>("/admin/email/templates/reviewer-invited"),
      apiJson<EmailTemplate>("/admin/email/templates/reminder-due"),
    ]);
    setPolicy(p);
    setPolicyDays(String(p.reviewDueInDays));
    setTplRi(a);
    setTplRd(b);
  }, []);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const profile = await apiJson<MeProfile>("/auth/me");
        if (cancelled) return;
        setMe(profile);
        if (
          !profile.permissions.includes(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
        ) {
          return;
        }
        await loadAll();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : t("loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, t, loadAll]);

  async function savePolicy() {
    if (!policy) return;
    const n = parseInt(policyDays, 10);
    if (!Number.isFinite(n) || n < 4) return;
    setBusyPolicy(true);
    setMsg(null);
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
      setMsg(t("policySaved"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMsg(t("conflict"));
        await loadAll().catch(() => undefined);
      } else {
        setMsg(err instanceof ApiError ? err.message : t("loadFailed"));
      }
    } finally {
      setBusyPolicy(false);
    }
  }

  async function saveTemplate(
    key: "reviewer-invited" | "reminder-due",
    tpl: EmailTemplate,
    subject: string,
    html: string,
    text: string,
    setBusy: (v: boolean) => void,
  ) {
    setBusy(true);
    setMsg(null);
    try {
      const next = await apiJson<EmailTemplate>(
        `/admin/email/templates/${encodeURIComponent(key)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            subjectTemplate: subject,
            htmlBody: html,
            textBody: text,
            expectedUpdatedAt: tpl.updatedAt,
          }),
        },
      );
      if (key === "reviewer-invited") setTplRi(next);
      else setTplRd(next);
      setMsg(t("templateSaved"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMsg(t("conflict"));
        await loadAll().catch(() => undefined);
      } else {
        setMsg(err instanceof ApiError ? err.message : t("loadFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function preview(
    key: "reviewer-invited" | "reminder-due",
    isOverdue?: boolean,
  ) {
    const body =
      key === "reminder-due" && typeof isOverdue === "boolean"
        ? JSON.stringify({ isOverdue })
        : "{}";
    return apiJson<{ subject: string; html: string; text: string }>(
      `/admin/email/templates/${encodeURIComponent(key)}/preview`,
      { method: "POST", body },
    );
  }

  if (!me) {
    return (
      <main className={submissionQueueShellCls}>
        <p className="text-sm text-ink/70">{t("loading")}</p>
      </main>
    );
  }

  if (!me.permissions.includes(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)) {
    return (
      <main className={submissionQueueShellCls}>
        <p className="text-red-700" role="alert">
          {t("forbidden")}
        </p>
      </main>
    );
  }

  if (error && !policy) {
    return (
      <main className={submissionQueueShellCls}>
        <p className="text-red-700">{error}</p>
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

      {msg && (
        <div
          className="mt-6 rounded-lg border border-ink/15 bg-paper/80 px-4 py-3 text-sm text-ink"
          role="status"
        >
          {msg}
        </div>
      )}

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

      {tplRi && (
        <section className="mt-8 rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm">
          <h2 className="font-sans text-lg font-semibold text-ink">
            {t("templateReviewerInvited")}
          </h2>
          <p className="mt-2 text-xs text-ink/55">{t("variablesReviewer")}</p>
          <TemplateFields
            locale={locale}
            subject={subjectRi}
            html={htmlRi}
            text={textRi}
            onSubject={(v) => setTplRi({ ...tplRi, subjectTemplate: v })}
            onHtml={(v) => setTplRi({ ...tplRi, htmlBody: v })}
            onText={(v) => setTplRi({ ...tplRi, textBody: v })}
            onSave={() =>
              saveTemplate(
                "reviewer-invited",
                tplRi,
                subjectRi,
                htmlRi,
                textRi,
                setBusyRi,
              )
            }
            onPreview={() => preview("reviewer-invited")}
            busy={busyRi}
            t={t}
          />
        </section>
      )}

      {tplRd && (
        <section className="mt-8 rounded-xl border border-ink/10 bg-paper/50 p-6 shadow-sm">
          <h2 className="font-sans text-lg font-semibold text-ink">
            {t("templateReminderDue")}
          </h2>
          <p className="mt-2 text-xs text-ink/55">{t("variablesReminder")}</p>
          <TemplateFields
            locale={locale}
            subject={subjectRd}
            html={htmlRd}
            text={textRd}
            onSubject={(v) => setTplRd({ ...tplRd, subjectTemplate: v })}
            onHtml={(v) => setTplRd({ ...tplRd, htmlBody: v })}
            onText={(v) => setTplRd({ ...tplRd, textBody: v })}
            onSave={() =>
              saveTemplate(
                "reminder-due",
                tplRd,
                subjectRd,
                htmlRd,
                textRd,
                setBusyRd,
              )
            }
            onPreview={() => preview("reminder-due")}
            onPreviewOverdue={() => preview("reminder-due", true)}
            busy={busyRd}
            t={t}
            showOverduePreview
          />
        </section>
      )}
    </main>
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
    } catch {
      setPv("Preview failed");
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
