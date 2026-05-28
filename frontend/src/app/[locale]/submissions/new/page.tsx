"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { apiJson, apiUpload } from "@/lib/api";
import {
  ACCEPT_FIGURE,
  ACCEPT_MANUSCRIPT,
  ACCEPT_SUPPLEMENTARY,
} from "@/lib/upload-accept";
import { toast } from "@/lib/toast";
import { useToastApiError } from "@/lib/use-toast-api-error";
import { CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY } from "@/lib/constructor-draft-intent";
import {
  constructorDraftHasSections,
  resolveConstructorDocxFileName,
} from "@/lib/constructor-docx-filename";
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
  type SubmissionFileKind,
} from "../[slug]/submission-workflow-forms";
import { ConstructorManuscriptRow } from "@/components/constructor/ConstructorManuscriptRow";
import { ReviewManuscriptPresentationPicker } from "@/components/constructor/ReviewManuscriptPresentationPicker";
import {
  PRE_SLUG_PRESENTATION_KEY,
  type ReviewManuscriptPresentation,
  readReviewManuscriptPresentation,
  resolveDefaultReviewManuscriptPresentation,
  reviewManuscriptPresentationStorageKey,
  writeReviewManuscriptPresentation,
} from "@/lib/review-manuscript-presentation";
import {
  readPreSlugStagedManuscript,
  writePreSlugStagedManuscript,
} from "@/lib/pre-slug-staged-manuscript";

import { useMe } from "@/lib/queries/auth";
import { SimpleSelect } from "@/components/ui/select";
import { KeywordTagsInput } from "@/components/ui/keyword-tags-input";
import {
  addAllSuggestedKeywords,
  addSuggestedKeyword,
  KeywordSuggestionChips,
  notifyKeywordAddFailure,
  SubmissionKeywordSuggest,
  type KeywordSuggestionResult,
} from "@/components/submission-keyword-suggest";
import { parseKeywordsFromStorage, serializeKeywords } from "@/lib/keywords";
import {
  ABSTRACT_MAX_WORDS,
  countWords,
  createSubmissionSchema,
  formatZodIssues,
  joinValidationBulletList,
  safeParseResult,
  SUBMISSION_ARTICLE_TYPES,
} from "@/lib/validation";
import { Spinner } from "@/components/ui/spinner";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";

type ContributorRow = {
  fullName: string;
  email?: string;
  affiliation: string;
  sortOrder: number;
  isCorresponding: boolean;
};

export default function NewSubmissionPage() {
  const t = useTranslations("SubmissionsNew");
  const tWf = useTranslations("SubmissionWorkflow");
  const tDetail = useTranslations("SubmissionDetail");
  const tv = useTranslations("Validation");
  const tConstructor = useTranslations("ConstructorPage");
  const tManuscript = useTranslations("ConstructorManuscript");
  const tConstructorMode = useTranslations("ConstructorMode");
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputId = useId();
  const locale = useLocale();
  const isAr = locale === "ar";
  const { resolve: resolveApiError } = useApiErrorMessages();
  const showApiError = useToastApiError();

  // Wizard state controller
  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);

  const reportValidationError = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    toast.error(trimmed, { id: "new-submission-validation" });
  }, []);

  // Form fields state
  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [abstract, setAbstract] = useState("");
  const [abstractAr, setAbstractAr] = useState("");
  const [articleType, setArticleType] = useState("");
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordTagsAr, setKeywordTagsAr] = useState<string[]>([]);
  const [keywordDraftAr, setKeywordDraftAr] = useState("");
  const [suggestedKeywordsEn, setSuggestedKeywordsEn] = useState<string[]>([]);
  const [suggestedKeywordsAr, setSuggestedKeywordsAr] = useState<string[]>([]);
  const [contributors, setContributors] = useState<ContributorRow[]>([
    {
      fullName: "",
      email: "",
      affiliation: "",
      sortOrder: 0,
      isCorresponding: true,
    },
  ]);
  const [fundingStatement, setFundingStatement] = useState("");
  const [coi, setCoi] = useState("");
  const [ethics, setEthics] = useState("");
  const [originality, setOriginality] = useState(false);
  const [aiUsage, setAiUsage] = useState("");

  // Staging files state
  const [stagedFiles, setStagedFiles] = useState<
    Partial<Record<SubmissionFileKind, File>>
  >({});
  const [formSaving, setFormSaving] = useState(false);
  const [constructorManuscriptName, setConstructorManuscriptName] = useState<
    string | null
  >(null);
  const [constructorManuscriptDismissed, setConstructorManuscriptDismissed] =
    useState(false);
  
  const [reviewPresentation, setReviewPresentation] =
    useState<ReviewManuscriptPresentation>(() => {
      const stored = readReviewManuscriptPresentation(PRE_SLUG_PRESENTATION_KEY);
      return (
        stored ?? {
          presentUploaded: true,
          presentConstructor: false,
        }
      );
    });

  // Mode Selection State
  // mode = "upload" sticky in search query if chosen
  const mode = searchParams.get("mode");
  const fromConstructor = searchParams.get("fromConstructor");

  // Fetch current user to auto pre-populate first author profile
  const meQuery = useMe();
  const me = meQuery.data;

  useEffect(() => {
    if (me && contributors.length === 1 && contributors[0].fullName === "") {
      setContributors([
        {
          fullName: me.displayName || "",
          email: me.email || "",
          affiliation: me.affiliation || "",
          sortOrder: 0,
          isCorresponding: true,
        },
      ]);
    }
  }, [me]);

  const syncConstructorManuscriptDisplay = useCallback(() => {
    if (!hasConstructorAttachIntent()) {
      setConstructorManuscriptName(null);
      return;
    }
    setConstructorManuscriptName(readConstructorManuscriptDisplayName());
  }, []);

  useEffect(() => {
    syncConstructorManuscriptDisplay();
  }, [syncConstructorManuscriptDisplay]);

  useEffect(() => {
    const cached = readPreSlugStagedManuscript();
    if (!cached) return;
    setStagedFiles((prev) =>
      prev.manuscript ? prev : { ...prev, manuscript: cached },
    );
  }, []);

  // Handle returning from Word Constructor draft
  useEffect(() => {
    if (fromConstructor !== "1") return;
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY, "1");
    } catch {
      // ignore
    }
    setConstructorManuscriptDismissed(false);
    const env = readConstructorDraftEnvelope();
    const partial = constructorContentToSubmissionMetadataInitial(
      env?.content,
    );
    
    // Pre-populate fields from constructor draft
    if (partial.title) setTitle(partial.title);
    if (partial.titleAr) setTitleAr(partial.titleAr);
    if (partial.abstract) setAbstract(partial.abstract);
    if (partial.abstractAr) setAbstractAr(partial.abstractAr);
    if (partial.articleType) setArticleType(partial.articleType);
    if (partial.keywords) setKeywordTags(parseKeywordsFromStorage(partial.keywords));
    if (partial.keywordsAr) setKeywordTagsAr(parseKeywordsFromStorage(partial.keywordsAr));
    if (partial.contributors?.length) {
      setContributors(
        partial.contributors.map((c, i) => ({
          fullName: c.fullName,
          email: c.email ?? "",
          affiliation: c.affiliation,
          sortOrder: c.sortOrder ?? i,
          isCorresponding: c.isCorresponding,
        })),
      );
    }

    if (constructorDraftHasSections(env?.content)) {
      setConstructorManuscriptName(
        resolveConstructorDocxFileName(env?.content),
      );
    }
    
    // Automatically skip step 1 to metadata editing
    setStep(2);
    setMaxStepReached(2);
    
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
            showApiError(e, tConstructor("attachConstructorFailed"), {
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
      writeReviewManuscriptPresentation(slug, reviewPresentation);
      try {
        sessionStorage.removeItem(
          reviewManuscriptPresentationStorageKey(PRE_SLUG_PRESENTATION_KEY),
        );
      } catch {
        // ignore
      }
      router.replace(`/submissions/${encodeURIComponent(slug)}`);
    },
    [router, showApiError, tConstructor, reviewPresentation],
  );

  function handleFilePick(kind: SubmissionFileKind, list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (fileExceedsUploadLimit(file)) {
      toast.error(tv("fileTooLarge", { maxMb: MAX_UPLOAD_MB }), {
        id: "new-submission-file-too-large",
      });
      return;
    }
    if (kind === "manuscript") {
      writePreSlugStagedManuscript(file);
    }
    setStagedFiles((prev) => ({ ...prev, [kind]: file }));
  }

  function clearStagedKind(kind: SubmissionFileKind) {
    setStagedFiles((prev) => {
      const next = { ...prev };
      delete next[kind];
      return next;
    });
    if (kind === "manuscript") {
      writePreSlugStagedManuscript(null);
      setConstructorManuscriptDismissed(false);
      syncConstructorManuscriptDisplay();
    }
  }

  function clearConstructorManuscriptStaging() {
    setConstructorManuscriptDismissed(true);
    clearConstructorAttachIntent();
    setConstructorManuscriptName(null);
  }

  const showConstructorManuscript =
    !constructorManuscriptDismissed && constructorManuscriptName != null;
  const hasStagedUpload = Boolean(stagedFiles.manuscript);
  const hasStagedConstructor = showConstructorManuscript;
  const stagedSources = {
    hasUploadedManuscript: hasStagedUpload,
    hasConstructorDraft: hasStagedConstructor,
  };

  useEffect(() => {
    setReviewPresentation((prev) => {
      const next = resolveDefaultReviewManuscriptPresentation(stagedSources);
      if (
        prev.presentUploaded === next.presentUploaded &&
        prev.presentConstructor === next.presentConstructor
      ) {
        return prev;
      }
      return next;
    });
  }, [hasStagedUpload, hasStagedConstructor]);

  // Contributor row methods
  const addContributor = () => {
    setContributors((rows) => [
      ...rows,
      {
        fullName: "",
        email: "",
        affiliation: "",
        sortOrder: rows.length,
        isCorresponding: false,
      },
    ]);
  };

  const removeContributor = (idx: number) => {
    setContributors((rows) => {
      const next = rows.filter((_, i) => i !== idx);
      if (!next.some((r) => r.isCorresponding) && next.length > 0) {
        next[0] = { ...next[0], isCorresponding: true };
      }
      return next.map((r, i) => ({ ...r, sortOrder: i }));
    });
  };

  const setCorresponding = (idx: number) => {
    setContributors((rows) =>
      rows.map((r, i) => ({ ...r, isCorresponding: i === idx })),
    );
  };

  const canSuggestKeywords =
    Boolean(title.trim() && abstract.trim()) ||
    Boolean(titleAr.trim() && abstractAr.trim());

  const keywordPreviewInput = useMemo(
    () => ({
      title: title.trim() || undefined,
      abstract: abstract.trim() || undefined,
      titleAr: titleAr.trim() || undefined,
      abstractAr: abstractAr.trim() || undefined,
    }),
    [title, abstract, titleAr, abstractAr],
  );

  const onKeywordSuggestions = useCallback(
    (result: KeywordSuggestionResult) => {
      setSuggestedKeywordsEn(result.keywordsEn);
      setSuggestedKeywordsAr(result.keywordsAr);
    },
    [],
  );

  const keywordAddMessages = useMemo(
    () => ({
      max: tWf("keywordSuggestMax"),
      duplicate: tWf("keywordSuggestDuplicate"),
      tooLong: tWf("keywordSuggestTooLong"),
      addAllNone: tWf("keywordSuggestAddAllNone"),
    }),
    [tWf],
  );

  const addEnKeyword = useCallback(
    (kw: string) => {
      setKeywordTags((tags) => {
        const result = addSuggestedKeyword(tags, kw, "en");
        if (result.addedCount > 0) return result.tags;
        notifyKeywordAddFailure(result.failure, keywordAddMessages);
        return tags;
      });
    },
    [keywordAddMessages],
  );

  const addAllEnKeywords = useCallback(() => {
    setKeywordTags((tags) => {
      const result = addAllSuggestedKeywords(tags, suggestedKeywordsEn, "en");
      if (result.addedCount > 0) return result.tags;
      notifyKeywordAddFailure(result.failure, keywordAddMessages);
      return tags;
    });
  }, [suggestedKeywordsEn, keywordAddMessages]);

  const addArKeyword = useCallback(
    (kw: string) => {
      setKeywordTagsAr((tags) => {
        const result = addSuggestedKeyword(tags, kw, "ar");
        if (result.addedCount > 0) return result.tags;
        notifyKeywordAddFailure(result.failure, keywordAddMessages);
        return tags;
      });
    },
    [keywordAddMessages],
  );

  const addAllArKeywords = useCallback(() => {
    setKeywordTagsAr((tags) => {
      const result = addAllSuggestedKeywords(tags, suggestedKeywordsAr, "ar");
      if (result.addedCount > 0) return result.tags;
      notifyKeywordAddFailure(result.failure, keywordAddMessages);
      return tags;
    });
  }, [suggestedKeywordsAr, keywordAddMessages]);

  // Step validation schemas
  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
      if (!articleType) {
        reportValidationError(t("validationArticleTypeRequired"));
        return false;
      }
      return true;
    }
    
    if (currentStep === 2) {
      if (!title.trim()) {
        reportValidationError(t("validationTitleEnRequired"));
        return false;
      }
      if (title.length > 500) {
        reportValidationError(t("validationTitleMaxLength"));
        return false;
      }
      if (titleAr.trim() && titleAr.length > 500) {
        reportValidationError(t("validationTitleArMaxLength"));
        return false;
      }
      if (!abstract.trim()) {
        reportValidationError(t("validationAbstractEnRequired"));
        return false;
      }
      if (countWords(abstract) > ABSTRACT_MAX_WORDS) {
        reportValidationError(tv("abstractMaxWordsEn", { max: ABSTRACT_MAX_WORDS }));
        return false;
      }
      if (abstractAr.trim() && countWords(abstractAr) > ABSTRACT_MAX_WORDS) {
        reportValidationError(tv("abstractMaxWordsAr", { max: ABSTRACT_MAX_WORDS }));
        return false;
      }
      if (keywordTags.length < 3 || keywordTags.length > 6) {
        reportValidationError(t("validationKeywordsEnRange"));
        return false;
      }
      if (titleAr.trim() && (keywordTagsAr.length < 3 || keywordTagsAr.length > 6)) {
        reportValidationError(t("validationKeywordsArRange"));
        return false;
      }
      return true;
    }
    
    if (currentStep === 3) {
      if (contributors.length === 0) {
        reportValidationError(t("validationAuthorsRequired"));
        return false;
      }
      for (let i = 0; i < contributors.length; i++) {
        const c = contributors[i];
        const authorIndex = i + 1;
        if (!c.fullName.trim()) {
          reportValidationError(t("validationAuthorFullNameRequired", { index: authorIndex }));
          return false;
        }
        if (!c.affiliation.trim()) {
          reportValidationError(t("validationAuthorAffiliationRequired", { index: authorIndex }));
          return false;
        }
        if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) {
          reportValidationError(t("validationAuthorEmailInvalid", { index: authorIndex }));
          return false;
        }
      }
      const correspondingCount = contributors.filter(c => c.isCorresponding).length;
      if (correspondingCount !== 1) {
        reportValidationError(t("validationCorrespondingAuthorRequired"));
        return false;
      }
      return true;
    }
    
    if (currentStep === 4) {
      if (!originality) {
        reportValidationError(t("validationOriginalityRequired"));
        return false;
      }
      return true;
    }
    
    if (currentStep === 5) {
      const hasCover = Boolean(stagedFiles.cover_letter);
      const hasTitle = Boolean(stagedFiles.title_page);
      const hasMain = Boolean(stagedFiles.manuscript) || showConstructorManuscript;
      
      if (!hasCover) {
        reportValidationError(t("validationCoverLetterRequired"));
        return false;
      }
      if (!hasTitle) {
        reportValidationError(t("validationTitlePageRequired"));
        return false;
      }
      if (!hasMain) {
        reportValidationError(t("validationManuscriptRequired"));
        return false;
      }
      return true;
    }
    
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => {
        const next = prev + 1;
        setMaxStepReached((max) => Math.max(max, next));
        return next;
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStepClick = (s: number) => {
    if (s <= maxStepReached) {
      for (let i = 1; i < s; i++) {
        if (!validateStep(i)) return;
      }
      setStep(s);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Unified save submission handler
  const save = useCallback(async () => {
    setFormSaving(true);
    try {
      const body = {
        title: title.trim(),
        titleAr: titleAr.trim(),
        abstract: abstract.trim(),
        abstractAr: abstractAr.trim(),
        keywords: serializeKeywords(keywordTags) || undefined,
        keywordsAr: serializeKeywords(keywordTagsAr) || undefined,
        fundingStatement: fundingStatement.trim() || undefined,
        conflictOfInterestStatement: coi.trim() || undefined,
        ethicalApprovalReference: ethics.trim() || undefined,
        originalityConfirmed: originality,
        aiUsageStatement: aiUsage.trim() || undefined,
        contributors: contributors.map((c, i) => ({
          fullName: c.fullName.trim(),
          email: c.email?.trim() || undefined,
          affiliation: c.affiliation.trim(),
          sortOrder: i,
          isCorresponding: c.isCorresponding,
        })),
        articleType: articleType || undefined,
      };

      const parsed = safeParseResult(createSubmissionSchema, body);
      if (!parsed.ok) {
        reportValidationError(
          joinValidationBulletList(formatZodIssues(tv, parsed.error.issues)),
        );
        setFormSaving(false);
        return;
      }

      // 1. Create the submission draft record
      const created = await apiJson<{ id: string; slug: string }>(
        "/submissions",
        {
          method: "POST",
          body: JSON.stringify(parsed.data),
        },
      );
      
      const createdSlug = created.slug;
      
      // 2. Upload staged files
      let uploadErr: string | null = null;
      for (const { kind } of FILE_KIND_ORDER) {
        const file = stagedFiles[kind];
        if (!file) continue;
        try {
          await apiUpload(
            `/submissions/${encodeURIComponent(createdSlug)}/files`,
            file,
            { kind },
          );
        } catch (e) {
          if (!uploadErr) {
            uploadErr = resolveApiError(e, tDetail("uploadFailed"));
          }
        }
      }
      
      toast.success(tWf("draftCreated"), { id: "new-submission-draft-created" });

      if (uploadErr) {
        toast.error(uploadErr, { id: "new-submission-upload-err" });
      }

      setStagedFiles({});
      writePreSlugStagedManuscript(null);

      // 3. Attach Constructor draft if needed & redirect
      await onCreated(createdSlug);
    } catch (e) {
      reportValidationError(resolveApiError(e, tWf("saveFailed")));
    } finally {
      setFormSaving(false);
    }
  }, [
    title,
    titleAr,
    abstract,
    abstractAr,
    articleType,
    keywordTags,
    keywordTagsAr,
    contributors,
    fundingStatement,
    coi,
    ethics,
    originality,
    aiUsage,
    stagedFiles,
    onCreated,
    reportValidationError,
    resolveApiError,
    tDetail,
    tWf,
    tv,
  ]);

  const tWfAny = tWf as unknown as (k: string) => string;
  const cardCls = "rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/60 dark:bg-white/5 backdrop-blur-md p-6 sm:p-8 shadow-sm hover:border-accent/[0.12] transition-all duration-300";

  return (
    <main className={PAGE_SHELL_NARROW}>
      {/* Top back link */}
      <Link href="/submissions" className="text-sm font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1">
        {t("back")}
      </Link>

      {/* Main Page Title */}
      <h1 className="mt-4 font-serif text-3xl font-bold tracking-tight text-ink">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-ink/65 mb-8">
        {t("draftStatusBeforeSave")}
      </p>

      {/* 1. Glassmorphic Wizard Step Header */}
      <div className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/60 dark:bg-white/5 backdrop-blur-md p-4 sm:p-6 mb-8 shadow-xs">
        <div className="absolute -right-20 -top-20 size-48 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 size-48 rounded-full bg-accent-2/5 blur-3xl" />
        
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink/50 dark:text-white/40 mb-4 px-1">
          <span>{isAr ? `الخطوة ${step} من 6` : `Step ${step} of 6`}</span>
          <span>{Math.round(((step - 1) / 5) * 100)}% {isAr ? "اكتمل" : "completed"}</span>
        </div>

        {/* Custom Progress Connectors */}
        <div className="relative flex items-center justify-between w-full px-2">
          <div className="absolute left-6 right-6 h-0.5 bg-ink/10 dark:bg-white/10 -z-10" />
          <div 
            className={`absolute h-0.5 transition-all duration-300 -z-10 ${
              isAr 
                ? "right-6 bg-gradient-to-l from-accent to-accent-2" 
                : "left-6 bg-gradient-to-r from-accent to-accent-2"
            }`}
            style={{ 
              width: `${((step - 1) / 5) * 100}%`,
            }} 
          />

          {[1, 2, 3, 4, 5, 6].map((s) => {
            const isCompleted = s < step;
            const isActive = s === step;
            const isSelectable = s <= maxStepReached;
            
            return (
              <button
                key={s}
                onClick={() => handleStepClick(s)}
                disabled={!isSelectable || formSaving}
                className={`relative flex items-center justify-center size-10 rounded-full border text-sm font-semibold transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-br from-accent to-accent-2 text-paper border-transparent scale-110 shadow-md ring-4 ring-accent/20"
                    : isCompleted
                      ? "bg-paper dark:bg-surface before:absolute before:inset-0 before:rounded-full before:bg-accent/10 before:dark:bg-accent/20 hover:before:bg-accent/20 before:pointer-events-none text-accent border-accent/40 hover:border-accent"
                      : "bg-paper dark:bg-surface text-ink/40 dark:text-white/30 border-ink/15 dark:border-white/15 cursor-not-allowed"
                }`}
                title={isAr ? `الخطوة ${s}` : `Step ${s}`}
              >
                {isCompleted ? (
                  <svg className="size-4 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : s}
                
                <span className={`absolute -bottom-6 left-1/2 -translate-x-1/2 hidden md:block text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                  isActive ? "text-accent" : isCompleted ? "text-ink/70 dark:text-white/60" : "text-ink/30 dark:text-white/20"
                }`}>
                  {s === 1 && (isAr ? "المسار والنوع" : "Path & Type")}
                  {s === 2 && (isAr ? "العنوان والكلمات" : "Title & Keywords")}
                  {s === 3 && (isAr ? "المؤلفون" : "Authors")}
                  {s === 4 && (isAr ? "التصريحات" : "Declarations")}
                  {s === 5 && (isAr ? "المستندات" : "Documents")}
                  {s === 6 && (isAr ? "المراجعة والتأكيد" : "Review")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Wizard Pages Container */}
      <div className="space-y-6">
        
        {/* Step 1: Submission Path & Type */}
        {step === 1 && (
          <section className={`${cardCls} space-y-6`}>
            <div className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-ink">
                {isAr ? "المسار والنوع" : "Manuscript Path & Type"}
              </h2>
              <p className="text-sm text-ink/65">
                {tDetail("chooseManuscriptModeHint")}
              </p>
            </div>

            {/* Custom high-end selection grid */}
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Constructor choice */}
              <Link
                href="/submissions/compose/create"
                className={`relative group rounded-xl border p-5 text-start transition-all duration-300 bg-paper/40 ${
                  showConstructorManuscript 
                    ? "border-accent ring-2 ring-accent/15" 
                    : "border-ink/10 hover:border-accent hover:bg-paper/70"
                }`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-lg font-semibold text-ink group-hover:text-accent transition-colors">
                      {tConstructorMode("constructorTitle")}
                    </span>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                      {tConstructorMode("constructorBadge")}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-ink/75">
                    {tConstructorMode("constructorDescription")}
                  </p>
                  
                  {/* Status Indicator */}
                  {showConstructorManuscript && constructorManuscriptName ? (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/5 px-2.5 py-1.5 rounded-lg border border-accent/10 animate-pulse">
                      <span className="size-1.5 rounded-full bg-accent" />
                      {t("constructorManuscriptBadge")}: {constructorManuscriptName}
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-accent mt-2 inline-flex items-center gap-1 group-hover:underline">
                      {tManuscript("openConstructor")} →
                    </span>
                  )}
                </div>
              </Link>

              {/* Upload choice */}
              <button
                type="button"
                onClick={() => router.push("/submissions/new?mode=upload")}
                className={`relative group rounded-xl border p-5 text-start transition-all duration-300 bg-paper/40 ${
                  mode === "upload" 
                    ? "border-accent ring-2 ring-accent/15" 
                    : "border-ink/10 hover:border-accent hover:bg-paper/70"
                }`}
              >
                <div className="flex flex-col gap-2">
                  <span className="font-serif text-lg font-semibold text-ink group-hover:text-accent transition-colors">
                    {tConstructorMode("uploadTitle")}
                  </span>
                  <p className="text-sm leading-relaxed text-ink/75">
                    {tConstructorMode("uploadDescription")}
                  </p>
                  
                  {/* Status Indicator */}
                  {mode === "upload" ? (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-500/[0.04] px-2.5 py-1.5 rounded-lg border border-emerald-500/10">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {isAr ? "مفعل: مسار رفع الملف" : "Active: Upload Path"}
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-accent mt-2 inline-flex items-center gap-1 group-hover:underline">
                      {isAr ? "تحديد هذا المسار" : "Select this path"} →
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* Article type selector */}
            <div className="border-t border-ink/[0.06] pt-6 flex flex-col gap-2">
              <label className="text-sm font-semibold text-ink">
                {tWf("articleType")} <span className="text-red-500">*</span>
              </label>
              <SimpleSelect
                value={articleType}
                onValueChange={setArticleType}
                placeholder={tWf("articleTypePlaceholder")}
                options={SUBMISSION_ARTICLE_TYPES.map((v) => ({
                  value: v,
                  label: tWfAny(`articleType_${v}`),
                }))}
              />
              <p className="text-xs text-ink/50 leading-relaxed">
                {isAr ? "يحدد نوع المقالة كيفية معالجة المخطوطة والخيارات الخاصة بعملية المراجعة." : "The article type affects review pipelines and options available during the review."}
              </p>
            </div>
          </section>
        )}

        {/* Step 2: Title & Abstracts */}
        {step === 2 && (
          <section className={`${cardCls} space-y-6 animate-fade-in`}>
            <div className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-ink">
                {isAr ? "العنوان والخلاصة والكلمات المفتاحية" : "Titles, Abstracts & Keywords"}
              </h2>
              <p className="text-sm text-ink/65">
                {isAr
                  ? "أدخل العنوان والملخص ثم اقترح الكلمات المفتاحية من النص."
                  : "Enter titles and abstracts, then suggest keywords from your text."}
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {/* LTR Columns (English) */}
              <div className="space-y-5 border-b pb-6 md:border-b-0 md:pb-0 md:pe-6 md:border-r border-ink/[0.08]" dir="ltr">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-accent">
                    English Version (Required)
                  </span>
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent uppercase font-mono">
                    LTR
                  </span>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink/70">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter English title..."
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-3 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-ink/25 transition-all duration-200"
                  />
                  <div className="flex justify-end text-[10px] font-mono text-ink/40">
                    {title.length}/500 chars
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink/70">
                    Abstract <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={abstract}
                    onChange={(e) => setAbstract(e.target.value)}
                    rows={8}
                    placeholder="Provide abstract in English..."
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-3 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-ink/25 transition-all duration-200 font-sans"
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono text-ink/40">
                    <span>Max {ABSTRACT_MAX_WORDS} words</span>
                    <span className={countWords(abstract) > ABSTRACT_MAX_WORDS ? "text-red-600 font-semibold" : ""}>
                      {countWords(abstract)} words
                    </span>
                  </div>
                </div>
              </div>

              {/* RTL Columns (Arabic) */}
              <div className="space-y-5" dir="rtl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-accent-2">
                    النسخة العربية (اختيارية)
                  </span>
                  <span className="rounded bg-accent-2/10 px-2 py-0.5 text-[10px] font-bold text-accent-2 uppercase font-mono">
                    RTL
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink/70">
                    العنوان العربي
                  </label>
                  <input
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    placeholder="أدخل العنوان باللغة العربية..."
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-3 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-ink/25 transition-all duration-200"
                  />
                  <div className="flex justify-end text-[10px] font-mono text-ink/40">
                    {titleAr.length}/500 حرف
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-ink/70">
                    الخلاصة العربية
                  </label>
                  <textarea
                    value={abstractAr}
                    onChange={(e) => setAbstractAr(e.target.value)}
                    rows={8}
                    placeholder="اكتب الملخص باللغة العربية..."
                    className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-3 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-ink/25 transition-all duration-200 font-sans"
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono text-ink/40">
                    <span>الحد الأقصى {ABSTRACT_MAX_WORDS} كلمة</span>
                    <span className={countWords(abstractAr) > ABSTRACT_MAX_WORDS ? "text-red-600 font-semibold" : ""}>
                      {countWords(abstractAr)} كلمة
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t border-ink/[0.06] pt-6">
              <SubmissionKeywordSuggest
                previewInput={keywordPreviewInput}
                canSuggest={canSuggestKeywords}
                suggestedEn={suggestedKeywordsEn}
                suggestedAr={suggestedKeywordsAr}
                onSuggestions={onKeywordSuggestions}
              />
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-2" dir="ltr">
                  <span
                    id="submission-keywords-en-label"
                    className="font-semibold text-sm text-ink"
                  >
                    {tWf("keywordsLabelEn")} *
                  </span>
                  <KeywordTagsInput
                    tags={keywordTags}
                    onChange={setKeywordTags}
                    inputValue={keywordDraft}
                    onInputChange={setKeywordDraft}
                    placeholder={tWf("keywordsPlaceholder")}
                    id="submission-keywords-en"
                    aria-labelledby="submission-keywords-en-label"
                  />
                  <span className="text-[10px] text-ink/40">
                    {tWf("keywordsCount", { count: keywordTags.length })}
                  </span>
                  <KeywordSuggestionChips
                    suggestions={suggestedKeywordsEn}
                    onAdd={addEnKeyword}
                    onAddAll={addAllEnKeywords}
                    addLabel={tWf("keywordSuggestAdd")}
                    addAllLabel={tWf("keywordSuggestAddAll")}
                    dir="ltr"
                    lang="en"
                  />
                </div>

                <div className="flex flex-col gap-2" dir="rtl">
                  <span
                    id="submission-keywords-ar-label"
                    className="font-semibold text-sm text-ink"
                  >
                    {tWf("keywordsLabelAr")} {titleAr.trim() && "*"}
                  </span>
                  <KeywordTagsInput
                    tags={keywordTagsAr}
                    onChange={setKeywordTagsAr}
                    inputValue={keywordDraftAr}
                    onInputChange={setKeywordDraftAr}
                    placeholder={tWf("keywordsPlaceholderAr")}
                    id="submission-keywords-ar"
                    aria-labelledby="submission-keywords-ar-label"
                  />
                  <span className="text-[10px] text-ink/40">
                    {tWf("keywordsCount", { count: keywordTagsAr.length })}
                  </span>
                  <KeywordSuggestionChips
                    suggestions={suggestedKeywordsAr}
                    onAdd={addArKeyword}
                    onAddAll={addAllArKeywords}
                    addLabel={tWf("keywordSuggestAdd")}
                    addAllLabel={tWf("keywordSuggestAddAll")}
                    dir="rtl"
                    lang="ar"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Step 3: Authors & Contributors */}
        {step === 3 && (
          <section className={`${cardCls} space-y-6 animate-fade-in`}>
            <div className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-ink">
                {tWf("sectionAuthors")}
              </h2>
              <p className="text-sm text-ink/65">
                {tWf("sectionAuthorsHint")}
              </p>
            </div>

            <div className="space-y-4">
              {contributors.map((c, idx) => (
                <div
                  key={idx}
                  className="group relative rounded-xl border border-ink/10 dark:border-white/10 bg-paper/40 p-5 sm:p-6 shadow-2xs hover:border-accent/15 transition-all duration-300 animate-fade-in"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] pb-3 mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink/50">
                      {tWf("authorN", { n: idx + 1 })}
                    </span>
                    
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                        <input
                          type="radio"
                          name="corresponding"
                          checked={c.isCorresponding}
                          onChange={() => setCorresponding(idx)}
                          className="size-4 text-accent border-ink/20 focus:ring-accent"
                        />
                        <span>{tWf("correspondingAuthor")}</span>
                      </label>
                      
                      {contributors.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeContributor(idx)}
                          className="text-xs font-semibold text-red-600 hover:text-red-800 transition-colors bg-red-500/5 px-2.5 py-1.5 rounded-lg border border-red-500/10"
                        >
                          {tWf("removeAuthor")}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1 text-sm sm:col-span-2">
                      <span className="font-semibold text-ink/75">{tWf("authorFullName")} *</span>
                      <input
                        value={c.fullName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setContributors((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, fullName: v } : r,
                            ),
                          );
                        }}
                        placeholder="John Doe"
                        className="rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-2.5 text-ink outline-none focus:border-accent hover:border-ink/25 transition-all duration-200"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1 text-sm">
                      <span className="font-semibold text-ink/75">{tWf("authorEmail")}</span>
                      <input
                        type="email"
                        value={c.email}
                        onChange={(e) => {
                          const v = e.target.value;
                          setContributors((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, email: v } : r,
                            ),
                          );
                        }}
                        placeholder="john.doe@example.com"
                        className="rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-2.5 text-ink outline-none focus:border-accent hover:border-ink/25 transition-all duration-200"
                      />
                    </div>

                    <div className="flex flex-col gap-1 text-sm sm:col-span-2">
                      <span className="font-semibold text-ink/75">{tWf("authorAffiliation")} *</span>
                      <input
                        value={c.affiliation}
                        onChange={(e) => {
                          const v = e.target.value;
                          setContributors((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, affiliation: v } : r,
                            ),
                          );
                        }}
                        placeholder={tWf("authorAffiliationPlaceholder")}
                        className="rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-2.5 text-ink outline-none focus:border-accent hover:border-ink/25 transition-all duration-200"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addContributor}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent/80 transition-colors bg-accent/5 px-4 py-2.5 rounded-xl border border-accent/10 hover:bg-accent/10"
            >
              {tWf("addAuthor")}
            </button>
          </section>
        )}

        {/* Step 4: Declarations */}
        {step === 4 && (
          <section className={`${cardCls} space-y-6 animate-fade-in`}>
            <div className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-ink">
                {isAr ? "التصريحات" : "Declarations"}
              </h2>
              <p className="text-sm text-ink/65">
                {tWf("sectionDeclarationsHint")}
              </p>
            </div>

            <div className="space-y-6">
              {/* Funding Statement */}
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-sm text-ink">{tWf("fundingStatement")}</span>
                <textarea
                  value={fundingStatement}
                  onChange={(e) => setFundingStatement(e.target.value)}
                  rows={2}
                  placeholder={tWf("fundingPlaceholder")}
                  className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-3 text-ink outline-none focus:border-accent hover:border-ink/25 transition-all duration-200"
                />
              </div>

              {/* Conflicts of Interest */}
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-sm text-ink">{tWf("conflictOfInterest")}</span>
                <textarea
                  value={coi}
                  onChange={(e) => setCoi(e.target.value)}
                  rows={2}
                  placeholder={tWf("coiPlaceholder")}
                  className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-3 text-ink outline-none focus:border-accent hover:border-ink/25 transition-all duration-200"
                />
              </div>

              {/* Ethical Approval */}
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-sm text-ink">{tWf("ethicalApproval")}</span>
                <input
                  value={ethics}
                  onChange={(e) => setEthics(e.target.value)}
                  placeholder={tWf("ethicalPlaceholder")}
                  className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-3 text-ink outline-none focus:border-accent hover:border-ink/25 transition-all duration-200"
                />
              </div>

              {/* AI Usage */}
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-sm text-ink">{tWf("aiUsage")}</span>
                <textarea
                  value={aiUsage}
                  onChange={(e) => setAiUsage(e.target.value)}
                  rows={2}
                  placeholder={tWf("aiPlaceholder")}
                  className="w-full rounded-xl border border-ink/15 dark:border-white/15 bg-paper/60 px-4 py-3 text-ink outline-none focus:border-accent hover:border-ink/25 transition-all duration-200"
                />
              </div>

              {/* Originality Confirmation */}
              <div className="border-t border-ink/[0.06] pt-5">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink/10 bg-paper/30 p-4 hover:border-accent/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={originality}
                    onChange={(e) => setOriginality(e.target.checked)}
                    className="mt-1 size-5 rounded border-ink/25 text-accent focus:ring-accent"
                  />
                  <span className="text-sm font-semibold leading-relaxed text-ink/80">
                    {tWf("originalityConfirm")} *
                  </span>
                </label>
              </div>
            </div>
          </section>
        )}

        {/* Step 5: Document Uploads */}
        {step === 5 && (
          <section className={`${cardCls} space-y-6 animate-fade-in`}>
            <div className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-ink">
                {tDetail("attachedFiles")}
              </h2>
              <p className="text-sm text-ink/65">
                {tDetail("uploadSubtitle")}
              </p>
              <p className="text-xs text-ink/50">
                {tManuscript("dualPathHint")}
              </p>
            </div>

            <div className="space-y-5">
              {FILE_KIND_ORDER.map(({ kind, required }) => {
                const staged = stagedFiles[kind];
                const showConstructorRow =
                  kind === "manuscript" && showConstructorManuscript;
                
                return (
                  <div
                    key={kind}
                    className="rounded-xl border border-ink/10 bg-paper/40 p-4 sm:p-5 shadow-2xs hover:border-accent/10 transition-colors animate-fade-in"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-2">
                      <span className="text-sm font-bold text-ink">
                        {tWfAny(`fileKind_${kind}`)}
                        {required ? (
                          <span className="ms-1.5 rounded bg-red-50 dark:bg-red-950/20 border border-red-200/30 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                            {tWf("requiredBadge")}
                          </span>
                        ) : (
                          <span className="ms-1.5 rounded bg-ink/5 dark:bg-white/5 border border-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-ink/40">
                            {tWf("optionalBadge")}
                          </span>
                        )}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-ink/55 mb-4">
                      {tWfAny(`fileKindHint_${kind}`)}
                    </p>

                    {/* Staged Word Constructor block */}
                    {showConstructorRow && constructorManuscriptName ? (
                      <div className="mb-4">
                        <ConstructorManuscriptRow
                          displayName={constructorManuscriptName}
                          editHref="/submissions/compose/create"
                          onRemove={clearConstructorManuscriptStaging}
                          removeLabel={t("clearStagedFile")}
                          disabled={formSaving}
                        />
                      </div>
                    ) : null}

                    {/* Staged file rendering */}
                    {staged ? (
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] p-3 text-sm border-dashed">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="size-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="truncate font-semibold text-ink/80">
                            {staged.name}
                          </span>
                          <span className="shrink-0 text-xs text-ink/40 font-mono">
                            ({(staged.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={formSaving}
                          onClick={() => clearStagedKind(kind)}
                          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                        >
                          {t("clearStagedFile")}
                        </button>
                      </div>
                    ) : null}

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        id={`${fileInputId}-${kind}`}
                        type="file"
                        accept={
                          kind === "figure" || kind === "table"
                            ? ACCEPT_FIGURE
                            : kind === "supplementary"
                              ? ACCEPT_SUPPLEMENTARY
                              : ACCEPT_MANUSCRIPT
                        }
                        className="sr-only"
                        disabled={formSaving}
                        onChange={(e) => {
                          handleFilePick(kind, e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor={`${fileInputId}-${kind}`}
                        className={`inline-flex items-center gap-1.5 cursor-pointer rounded-xl border border-ink/15 dark:border-white/15 bg-paper px-4 py-2 text-xs font-bold text-ink shadow-2xs hover:border-accent/40 active:scale-[0.98] transition-all duration-150 ${formSaving ? "pointer-events-none opacity-50" : ""}`}
                      >
                        <svg className="size-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        {tDetail("chooseFile")}
                      </label>
                    </div>

                    {/* Review Manuscript presentation options */}
                    {kind === "manuscript" ? (
                      <div className="mt-5 border-t border-ink/[0.06] pt-4">
                        <ReviewManuscriptPresentationPicker
                          value={reviewPresentation}
                          onChange={(next) => {
                            setReviewPresentation(next);
                            writeReviewManuscriptPresentation(
                              PRE_SLUG_PRESENTATION_KEY,
                              next,
                            );
                          }}
                          hasUploadedManuscript={hasStagedUpload}
                          hasConstructorDraft={hasStagedConstructor}
                          disabled={formSaving}
                        />
                        <p className="mt-2.5 text-xs text-ink/50">
                          {t("presentationBeforeSaveHint")}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            
            <p className="text-xs text-ink/50 pt-2 border-t border-ink/[0.06]">
              {tDetail("uploadHint")}
            </p>
          </section>
        )}

        {/* Step 6: Review & Finalize */}
        {step === 6 && (
          <section className="space-y-6 animate-fade-in">
            {/* Visual Glassmorphic Overview Card */}
            <div className={`${cardCls}`}>
              <div className="space-y-2 border-b border-ink/[0.06] pb-4 mb-6">
                <h2 className="font-serif text-xl font-semibold text-ink">
                  {isAr ? "مراجعة الطلب وتأكيده" : "Review & Confirm Submission"}
                </h2>
                <p className="text-sm text-ink/65">
                  {isAr ? "يرجى مراجعة كافة التفاصيل قبل حفظ مسودة التقديم." : "Please double-check all details. You can save your draft to finish editing anytime."}
                </p>
              </div>

              {/* Grid of details */}
              <div className="space-y-6">
                
                {/* 1. Article Path & Type */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      1. {isAr ? "المسار والنوع" : "Path & Type"}
                    </span>
                    <button onClick={() => setStep(1)} className="text-xs font-bold text-accent hover:underline">
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div>
                      <span className="text-ink/50 font-semibold">{tWf("articleType")}:</span>{" "}
                      <span className="text-ink font-bold">
                        {articleType ? tWfAny(`articleType_${articleType}`) : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink/50 font-semibold">{isAr ? "مسار المخطوطة:" : "Manuscript Source:"}</span>{" "}
                      <span className="text-ink font-bold">
                        {showConstructorManuscript 
                          ? (isAr ? "منشئ المخطوطات (Word)" : "Word Constructor Draft") 
                          : (isAr ? "ملف مرفوع" : "File Upload Path")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Metadata English & Arabic */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      2. {isAr ? "العناوين والخلاصة والكلمات" : "Titles, Abstracts & Keywords"}
                    </span>
                    <button onClick={() => setStep(2)} className="text-xs font-bold text-accent hover:underline">
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-ink/40 uppercase">English Metadata</span>
                      <h3 className="font-serif text-base font-bold text-ink leading-snug">{title}</h3>
                      <p className="text-xs text-ink/75 whitespace-pre-wrap leading-relaxed font-sans">{abstract}</p>
                    </div>

                    {titleAr.trim() && (
                      <div className="space-y-1 pt-3 border-t border-ink/[0.04]" dir="rtl">
                        <span className="text-xs font-bold text-ink/40 uppercase">البيانات باللغة العربية</span>
                        <h3 className="font-serif text-base font-bold text-ink leading-snug">{titleAr}</h3>
                        <p className="text-xs text-ink/75 whitespace-pre-wrap leading-relaxed font-sans">{abstractAr}</p>
                      </div>
                    )}

                    <div className="space-y-2 pt-3 border-t border-ink/[0.04] text-sm">
                      <div>
                        <span className="text-ink/50 font-semibold">
                          {isAr ? "الكلمات الإنجليزية:" : "English Keywords:"}
                        </span>{" "}
                        <span className="text-ink font-medium">{keywordTags.join(", ")}</span>
                      </div>
                      {keywordTagsAr.length > 0 && (
                        <div dir="rtl">
                          <span className="text-ink/50 font-semibold">
                            {isAr ? "الكلمات العربية:" : "Arabic Keywords:"}
                          </span>{" "}
                          <span className="text-ink font-medium">{keywordTagsAr.join("، ")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Authors List */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      3. {tWf("sectionAuthors")}
                    </span>
                    <button onClick={() => setStep(3)} className="text-xs font-bold text-accent hover:underline">
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                  </div>
                  
                  <ul className="space-y-2.5">
                    {contributors.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-paper/20 p-2.5 rounded-lg border border-ink/[0.03]">
                        <div>
                          <span className="font-bold text-ink">{c.fullName}</span>
                          {c.email && <span className="text-xs text-ink/50 ms-2">({c.email})</span>}
                          <p className="text-xs text-ink/65 mt-0.5">{c.affiliation}</p>
                        </div>
                        {c.isCorresponding && (
                          <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                            {tWf("correspondingAuthor")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. Declarations */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      4. {isAr ? "التصريحات" : "Declarations"}
                    </span>
                    <button onClick={() => setStep(4)} className="text-xs font-bold text-accent hover:underline">
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    {fundingStatement.trim() && (
                      <div className="pt-2 border-t border-ink/[0.04]">
                        <span className="text-ink/50 font-semibold">{tWf("fundingStatement")}:</span>{" "}
                        <p className="text-xs text-ink/80 mt-0.5 whitespace-pre-wrap">{fundingStatement}</p>
                      </div>
                    )}

                    {coi.trim() && (
                      <div className="pt-2 border-t border-ink/[0.04]">
                        <span className="text-ink/50 font-semibold">{tWf("conflictOfInterest")}:</span>{" "}
                        <p className="text-xs text-ink/80 mt-0.5 whitespace-pre-wrap">{coi}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Document List */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      5. {tDetail("attachedFiles")}
                    </span>
                    <button onClick={() => setStep(5)} className="text-xs font-bold text-accent hover:underline">
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                  </div>

                  <ul className="space-y-2 text-sm">
                    {/* Cover letter */}
                    <li className="flex items-center justify-between py-1.5 border-b border-ink/[0.04] last:border-0">
                      <span className="font-semibold text-ink">{tWf("fileKind_cover_letter")}:</span>
                      <span className="text-xs text-ink/60 truncate max-w-[200px]">
                        {stagedFiles.cover_letter?.name || "—"}
                      </span>
                    </li>
                    {/* Title page */}
                    <li className="flex items-center justify-between py-1.5 border-b border-ink/[0.04] last:border-0">
                      <span className="font-semibold text-ink">{tWf("fileKind_title_page")}:</span>
                      <span className="text-xs text-ink/60 truncate max-w-[200px]">
                        {stagedFiles.title_page?.name || "—"}
                      </span>
                    </li>
                    {/* Manuscript */}
                    <li className="flex items-center justify-between py-1.5 border-b border-ink/[0.04] last:border-0">
                      <span className="font-semibold text-ink">{tDetail("manuscript")}:</span>
                      <span className="text-xs text-ink/60 truncate max-w-[200px]">
                        {showConstructorManuscript 
                          ? `[Word Constructor] ${constructorManuscriptName}` 
                          : (stagedFiles.manuscript?.name || "—")}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3. Navigation Controls */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-ink/[0.06]">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={formSaving}
              className="inline-flex items-center justify-center rounded-xl border border-ink/15 dark:border-white/15 bg-paper/40 px-6 py-3 text-sm font-semibold text-ink hover:border-accent/40 active:scale-[0.98] transition-all duration-150 shadow-xs"
            >
              {isAr ? "← السابق" : "← Back"}
            </button>
          ) : (
            <div />
          )}

          {step < 6 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={formSaving}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-accent to-accent-2 px-6 py-3 text-sm font-semibold text-paper hover:opacity-90 active:scale-[0.98] transition-all duration-150 shadow-sm"
            >
              {isAr ? "التالي →" : "Next →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void save()}
              disabled={formSaving}
              className="relative overflow-hidden inline-flex min-w-[12rem] items-center justify-center rounded-xl bg-ink dark:bg-white dark:text-paper px-8 py-3 text-sm font-bold text-paper shadow-md hover:bg-ink/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
            >
              {formSaving ? (
                <Spinner size="sm" className="border-ink/30 border-t-paper" />
              ) : (
                isAr ? "حفظ مسودة التقديم" : "Create Submission Draft"
              )}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function readConstructorManuscriptDisplayName(): string | null {
  const env = readConstructorDraftEnvelope();
  if (!constructorDraftHasSections(env?.content)) return null;
  return resolveConstructorDocxFileName(env?.content);
}

function hasConstructorAttachIntent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      sessionStorage.getItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function clearConstructorAttachIntent(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY);
  } catch {
    // ignore
  }
}
