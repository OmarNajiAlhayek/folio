"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, getApiBase, getStoredToken } from "@/lib/api";
import { PAGE_SHELL } from "@/lib/page-shell";
import { ConstructorWorkspace } from "@/components/constructor/ConstructorWorkspace";
import { useConstructorDraft } from "@/lib/use-constructor-draft";

/**
 * Pre-slug constructor: builds the article entirely client-side, persisting
 * to localStorage and syncing across tabs via BroadcastChannel.
 *
 * Creating a server submission happens from `/submissions/new`. Use
 * “Continue to create submission” to go there with optional metadata prefill.
 */
export default function NewConstructorPage() {
  const t = useTranslations("ConstructorPage");
  const router = useRouter();
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { content, setContent, quotaExceeded, externalUpdateAt } =
    useConstructorDraft();

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!getStoredToken()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (!externalUpdateAt) return;
    const handle = setTimeout(() => setNow(Date.now()), 4100);
    return () => clearTimeout(handle);
  }, [externalUpdateAt]);

  const externalNotice =
    externalUpdateAt != null && now - externalUpdateAt < 4000;

  function sanitizeFileNamePart(value: string): string {
    return value
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveDocxFileName(): string {
    const sections = content.sections ?? [];
    const arabicTitle = sections.find(
      (s) =>
        s.kind === "title" &&
        typeof (s as { lang?: string }).lang === "string" &&
        (s as { lang?: string }).lang === "ar" &&
        typeof (s as { text?: string }).text === "string" &&
        (s as { text?: string }).text?.trim(),
    ) as { text?: string } | undefined;
    const fallbackArabicName = "مقال-منشئ-وورد";
    const base = sanitizeFileNamePart(arabicTitle?.text ?? fallbackArabicName);
    return `${base || fallbackArabicName}.docx`;
  }

  async function handleDownloadDocx() {
    setDownloadError(null);
    setDownloadingDocx(true);
    try {
      if (!getStoredToken()) {
        router.replace("/login");
        return;
      }
      const token = getStoredToken();
      const res = await fetch(
        `${getApiBase()}/api/v1/submissions/generate-docx-standalone`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ content, attach: false }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new ApiError(text || res.statusText, undefined, res.status);
      }
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = resolveDocxFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (e) {
      setDownloadError(e instanceof ApiError ? e.message : t("generateFailed"));
    } finally {
      setDownloadingDocx(false);
    }
  }

  return (
    <main className={PAGE_SHELL}>
      <Link
        href="/submissions/new"
        className="text-sm text-accent hover:underline"
      >
        {t("backToModeSelection")}
      </Link>
      <header className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">
            {t("titleNew")}
          </h1>
          <p className="mt-1 text-sm text-ink/65">{t("subtitleNew")}</p>
        </div>
      </header>

      <section className="mt-6">
        <ConstructorWorkspace
          content={content}
          onChange={setContent}
          notice={
            <>
              <p className="text-sm text-ink/70">{t("browserDraftNotice")}</p>
              {downloadError ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-300/70 bg-red-100/75 px-3 py-2 text-sm text-red-800 dark:border-red-500/35 dark:bg-red-500/12 dark:text-red-200"
                >
                  {downloadError}
                </div>
              ) : null}
              {quotaExceeded ? (
                <div className="rounded-md border border-amber-300/70 bg-amber-100/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-200">
                  {t("quotaExceeded")}
                </div>
              ) : null}
              {externalNotice ? (
                <div className="rounded-md border border-sky-300/70 bg-sky-100/70 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/35 dark:bg-sky-500/12 dark:text-sky-200">
                  {t("externalUpdate")}
                </div>
              ) : null}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDownloadDocx()}
                disabled={downloadingDocx}
                data-testid="constructor-download-docx-only"
                className="inline-flex rounded-md border border-ink/20 bg-paper px-4 py-2 text-sm font-medium text-ink shadow-sm hover:border-accent/40 disabled:opacity-50"
              >
                {downloadingDocx ? t("generatingDocx") : t("downloadDocxOnly")}
              </button>
              <Link
                href="/submissions/new?fromConstructor=1"
                data-testid="constructor-continue-submission"
                className="inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
              >
                {t("continueToSubmission")}
              </Link>
            </div>
          }
        />
      </section>
    </main>
  );
}
