"use client";

import { Suspense, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { apiPostJsonOrBlob } from "@/lib/api";
import { useAuthRedirect } from "@/lib/use-auth-redirect";
import { useToastApiError } from "@/lib/use-toast-api-error";
import { PAGE_SHELL } from "@/lib/page-shell";
import { ConstructorWorkspace } from "@/components/constructor/ConstructorWorkspace";
import { resolveConstructorDocxFileName } from "@/lib/constructor-docx-filename";
import { CONSTRUCTOR_IMPORT_WARNINGS_SCOPE_PRE_SLUG } from "@/lib/constructor-import-warnings-storage";
import { ensureMandatoryConstructorSections } from "@/lib/constructor-mandatory-sections";
import { useConstructorDocxImport } from "@/lib/use-constructor-docx-import";
import { useConstructorStyleGuidance } from "@/lib/use-constructor-style-guidance";
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
  const locale = useLocale();
  useAuthRedirect();
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const showApiError = useToastApiError();

  const { content, setContent, quotaExceeded, externalUpdateAt } =
    useConstructorDraft();
  const { guidance } = useConstructorStyleGuidance(content);

  const {
    importButton,
    importWarningsNotice,
    confirmDialog,
    importing: importingDocx,
  } = useConstructorDocxImport({
    content,
    guidance,
    onContentChange: (merged) => {
      setContent(ensureMandatoryConstructorSections(merged, guidance));
    },
    scopeKey: CONSTRUCTOR_IMPORT_WARNINGS_SCOPE_PRE_SLUG,
    canImport: true,
    locale,
    t,
    actionsDisabled: downloadingDocx,
  });

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!externalUpdateAt) return;
    const handle = setTimeout(() => setNow(Date.now()), 4100);
    return () => clearTimeout(handle);
  }, [externalUpdateAt]);

  const externalNotice =
    externalUpdateAt != null && now - externalUpdateAt < 4000;

  async function handleDownloadDocx() {
    setDownloadingDocx(true);
    try {
      const result = await apiPostJsonOrBlob(
        "/submissions/generate-docx-standalone",
        { content, attach: false },
      );
      if (result.kind !== "blob") return;
      const blob = result.data;
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = resolveConstructorDocxFileName(content);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (e) {
      showApiError(e, t("generateFailed"), { id: "constructor-new-download" });
    } finally {
      setDownloadingDocx(false);
    }
  }

  return (
    <main className={PAGE_SHELL}>
      {confirmDialog}

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
        <Suspense fallback={<p className="text-sm text-ink/60">{t("loading")}</p>}>
          <ConstructorWorkspace
            content={content}
            onChange={setContent}
            notice={
            <>
              <p className="text-sm text-ink/70">{t("browserDraftNotice")}</p>
              {importWarningsNotice}
              {quotaExceeded ? (
                <div className="rounded-md border border-amber-300/70 bg-amber-100/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-200">
                  {t("quotaExceeded")}
                </div>
              ) : null}
              {externalNotice ? (
                <div className="rounded-md border border-amber-300/70 bg-sky-100/70 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/35 dark:bg-sky-500/12 dark:text-sky-200">
                  {t("externalUpdate")}
                </div>
              ) : null}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {importButton}
              <button
                type="button"
                onClick={() => void handleDownloadDocx()}
                disabled={downloadingDocx || importingDocx}
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
        </Suspense>
      </section>
    </main>
  );
}
