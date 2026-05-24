"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { apiJson, getStoredToken } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth-redirect";
import { toast, toastApiError } from "@/lib/toast";
import { CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY } from "@/lib/constructor-draft-intent";
import { constructorContentToSubmissionMetadataInitial } from "@/lib/constructor-to-submission-metadata";
import {
  clearConstructorDraftStorage,
  readConstructorDraftEnvelope,
} from "@/lib/use-constructor-draft";
import { PAGE_SHELL_NARROW } from "@/lib/page-shell";
import {
  fileExceedsUploadLimit,
  MAX_UPLOAD_MB,
} from "@/lib/validation";
import {
  FILE_KIND_ORDER,
  SubmissionMetadataForm,
  type SubmissionFileKind,
  type SubmissionMetadataFormInitial,
} from "../[slug]/submission-workflow-forms";
import { ModeSelector } from "@/components/constructor/ModeSelector";

const EMPTY_NEW_INITIAL: SubmissionMetadataFormInitial = {
  title: "",
  titleAr: "",
  abstract: "",
  abstractAr: "",
  articleType: null,
  keywords: null,
  keywordsAr: null,
  contributors: null,
  fundingStatement: null,
  conflictOfInterestStatement: null,
  ethicalApprovalReference: null,
  originalityConfirmed: false,
  aiUsageStatement: null,
};

function mergeMetadataInitial(
  partial: Partial<SubmissionMetadataFormInitial>,
): SubmissionMetadataFormInitial {
  return { ...EMPTY_NEW_INITIAL, ...partial };
}

export default function NewSubmissionPage() {
  const t = useTranslations("SubmissionsNew");
  const tWf = useTranslations("SubmissionWorkflow");
  const tDetail = useTranslations("SubmissionDetail");
  const tv = useTranslations("Validation");
  const tConstructor = useTranslations("ConstructorPage");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInputId = useId();
  const [stagedFiles, setStagedFiles] = useState<
    Partial<Record<SubmissionFileKind, File>>
  >({});
  const [formSaving, setFormSaving] = useState(false);
  const [metadataInitial, setMetadataInitial] =
    useState<SubmissionMetadataFormInitial>(EMPTY_NEW_INITIAL);

  // The mode selector links here with `?mode=upload` once the user picks
  // upload, which makes the chosen mode sticky for the lifetime of this tab.
  const mode = searchParams.get("mode");
  const showModeSelector = mode !== "upload";
  const fromConstructor = searchParams.get("fromConstructor");

  const getStagedFiles = useCallback(() => stagedFiles, [stagedFiles]);
  const clearStagedFiles = useCallback(() => setStagedFiles({}), []);

  useEffect(() => {
    if (!getStoredToken()) redirectToLogin(router, pathname);
  }, [router, pathname]);

  useEffect(() => {
    if (fromConstructor !== "1") return;
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY, "1");
    } catch {
      // ignore
    }
    const env = readConstructorDraftEnvelope();
    const partial = constructorContentToSubmissionMetadataInitial(
      env?.content,
    );
    setMetadataInitial(mergeMetadataInitial(partial));
    const nextPath =
      mode === "upload"
        ? "/submissions/new?mode=upload"
        : "/submissions/new";
    router.replace(nextPath);
  }, [fromConstructor, mode, router]);

  const onCreated = useCallback(
    async (slug: string) => {
      if (typeof window !== "undefined") {
        const shouldAttach =
          sessionStorage.getItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY) ===
          "1";
        if (shouldAttach) {
          try {
            const env = readConstructorDraftEnvelope();
            if (env?.content?.sections?.length) {
              await apiJson(`/submissions/${encodeURIComponent(slug)}`, {
                method: "PATCH",
                body: JSON.stringify({ constructorContent: env.content }),
              });
              clearConstructorDraftStorage();
            }
          } catch (e) {
            // user-facing: attach constructor draft after create failed
            toastApiError(e, tConstructor("attachConstructorFailed"), {
              id: "new-submission-attach-constructor",
            });
          } finally {
            try {
              sessionStorage.removeItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY);
            } catch {
              // ignore
            }
          }
        }
      }
      router.replace(`/submissions/${encodeURIComponent(slug)}`);
    },
    [router, tConstructor],
  );

  const cardCls = "rounded-lg border border-ink/10 bg-surface shadow-sm p-6";
  const tWfAny = tWf as unknown as (k: string) => string;

  function handleFilePick(kind: SubmissionFileKind, list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (fileExceedsUploadLimit(file)) {
      toast.error(tv("fileTooLarge", { maxMb: MAX_UPLOAD_MB }), {
        id: "new-submission-file-too-large",
      });
      return;
    }
    setStagedFiles((prev) => ({ ...prev, [kind]: file }));
  }

  function clearStagedKind(kind: SubmissionFileKind) {
    setStagedFiles((prev) => {
      const next = { ...prev };
      delete next[kind];
      return next;
    });
  }

  return (
    <main className={PAGE_SHELL_NARROW}>
      <Link href="/submissions" className="text-sm text-accent hover:underline">
        {t("back")}
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold text-ink">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-ink/70">{t("draftStatusBeforeSave")}</p>

      {showModeSelector && (
        <div className="mt-6">
          <ModeSelector newSubmissionMode />
        </div>
      )}

      <section className={`mt-6 ${cardCls}`}>
        <h2 className="font-serif text-lg font-semibold text-ink">
          {tWf("metadataEditTitle")}
        </h2>
        <p className="mt-1 text-sm text-ink/65">{tWf("metadataEditHint")}</p>
        <div className="mt-6">
          <SubmissionMetadataForm
            createMode
            canEdit
            initial={metadataInitial}
            saveButtonLabel={t("saveDraft")}
            getStagedFiles={getStagedFiles}
            clearStagedFiles={clearStagedFiles}
            onSavingChange={setFormSaving}
            onCreated={(slug) => void onCreated(slug)}
            onError={(msg) => {
              const m = msg.trim();
              if (m) toast.error(m, { id: "new-submission-metadata" });
            }}
          />
        </div>
      </section>

      <section className={`mt-8 space-y-6 ${cardCls}`}>
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">
            {tDetail("manuscript")}
          </h2>
          <p className="mt-1 text-sm text-ink/70">{tDetail("uploadSubtitle")}</p>
          <p className="mt-2 text-sm text-ink/65">{t("manuscriptAttachHint")}</p>
        </div>
        <div className="space-y-5">
          {FILE_KIND_ORDER.map(({ kind, required }) => {
            const staged = stagedFiles[kind];
            return (
              <div
                key={kind}
                className="rounded-lg border border-ink/10 bg-paper/40 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {tWfAny(`fileKind_${kind}`)}
                    {required ? (
                      <span className="ms-1 text-xs font-normal text-red-700">
                        {tWf("requiredBadge")}
                      </span>
                    ) : (
                      <span className="ms-1 text-xs font-normal text-ink/50">
                        {tWf("optionalBadge")}
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink/55">
                  {tWfAny(`fileKindHint_${kind}`)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    id={`${fileInputId}-${kind}`}
                    type="file"
                    className="sr-only"
                    disabled={formSaving}
                    onChange={(e) => {
                      handleFilePick(kind, e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <label
                    htmlFor={`${fileInputId}-${kind}`}
                    className={`inline-flex cursor-pointer rounded-md border border-ink/20 bg-paper px-4 py-2 text-sm font-medium text-ink shadow-sm hover:border-accent/40 ${formSaving ? "pointer-events-none opacity-50" : ""}`}
                  >
                    {tDetail("chooseFile")}
                  </label>
                  {staged ? (
                    <>
                      <span className="min-w-0 max-w-full truncate text-sm text-ink/80">
                        {t("stagedFileLabel")}: {staged.name}
                      </span>
                      <button
                        type="button"
                        disabled={formSaving}
                        onClick={() => clearStagedKind(kind)}
                        className="text-sm text-accent hover:underline disabled:pointer-events-none disabled:opacity-50"
                      >
                        {t("clearStagedFile")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-ink/60">{tDetail("uploadHint")}</p>
      </section>
    </main>
  );
}
