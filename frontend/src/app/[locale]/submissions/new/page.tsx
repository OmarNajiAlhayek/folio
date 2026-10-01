'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, CircleCheck, Upload } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { apiJson, apiUpload } from '@/lib/api';
import {
  ACCEPT_FIGURE,
  ACCEPT_MANUSCRIPT,
  ACCEPT_SUPPLEMENTARY,
} from '@/lib/upload-accept';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY } from '@/lib/constructor-draft-intent';
import {
  constructorDraftHasSections,
  resolveConstructorDocxFileName,
} from '@/lib/constructor-docx-filename';
import { constructorContentToSubmissionMetadataInitial } from '@/lib/constructor-to-submission-metadata';
import {
  clearConstructorDraftStorage,
  readConstructorDraftEnvelope,
} from '@/lib/use-constructor-draft';
import { PAGE_SHELL_NARROW } from '@/lib/page-shell';
import { CONSTRUCTOR_ENTRY_POINTS_ENABLED } from '@/lib/constructor-entry-points';
import { fileExceedsUploadLimit, MAX_UPLOAD_MB } from '@/lib/validation';
import {
  emptySubmissionMetadataInitial,
  FILE_KIND_ORDER,
  SubmissionMetadataForm,
  type SubmissionFileKind,
  type SubmissionMetadataFormHandle,
  type SubmissionMetadataFormInitial,
  type SubmissionMetadataWizardSnapshot,
} from '../[slug]/submission-workflow-forms';
import { ConstructorManuscriptRow } from '@/components/constructor/ConstructorManuscriptRow';
import { ReviewManuscriptPresentationPicker } from '@/components/constructor/ReviewManuscriptPresentationPicker';
import {
  PRE_SLUG_PRESENTATION_KEY,
  type ReviewManuscriptPresentation,
  readReviewManuscriptPresentation,
  resolveDefaultReviewManuscriptPresentation,
  reviewManuscriptPresentationStorageKey,
  writeReviewManuscriptPresentation,
} from '@/lib/review-manuscript-presentation';
import {
  readPreSlugStagedManuscript,
  writePreSlugStagedManuscript,
} from '@/lib/pre-slug-staged-manuscript';

import { useMe } from '@/lib/queries/auth';
import { useJournalOptions } from '@/lib/queries/journals';
import { SimpleSelect } from '@/components/ui/select';
import { SubmissionJournalPicker } from '@/components/submission-journal-picker';
import { fileFieldKey, fileRowCls } from '@/lib/submission-field-errors';
import { SUBMISSION_ARTICLE_TYPES } from '@/lib/validation';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { FileDropZone } from '@/components/ui/file-drop-zone';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';

export default function NewSubmissionPage() {
  const t = useTranslations('SubmissionsNew');
  const tWf = useTranslations('SubmissionWorkflow');
  const tDetail = useTranslations('SubmissionDetail');
  const tv = useTranslations('Validation');
  const tConstructor = useTranslations('ConstructorPage');
  const tManuscript = useTranslations('ConstructorManuscript');
  const tConstructorMode = useTranslations('ConstructorMode');

  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputId = useId();
  const locale = useLocale();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const showApiError = useToastApiError();

  // Wizard state controller
  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);

  const reportValidationError = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    toast.error(trimmed, { id: 'new-submission-validation' });
  }, []);

  const [fieldErrors, setFieldErrors] = useState<Set<string>>(() => new Set());
  const metadataFormRef = useRef<SubmissionMetadataFormHandle>(null);
  const [metadataInitial, setMetadataInitial] =
    useState<SubmissionMetadataFormInitial>(emptySubmissionMetadataInitial);
  const [reviewSnapshot, setReviewSnapshot] =
    useState<SubmissionMetadataWizardSnapshot | null>(null);

  const hasErr = useCallback(
    (key: string) => fieldErrors.has(key),
    [fieldErrors],
  );

  const clearErr = useCallback((key: string) => {
    setFieldErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const [articleType, setArticleType] = useState('');
  const [journalId, setJournalId] = useState('');
  const { data: journalOptions } = useJournalOptions();
  const selectedJournal = journalOptions?.find((j) => j.id === journalId);
  const selectedJournalTitle = selectedJournal
    ? locale === 'ar'
      ? selectedJournal.titleAr
      : selectedJournal.titleEn
    : null;

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
      const stored = readReviewManuscriptPresentation(
        PRE_SLUG_PRESENTATION_KEY,
      );
      return (
        stored ?? {
          presentUploaded: true,
          presentConstructor: false,
        }
      );
    });

  // Mode Selection State
  // mode = "upload" sticky in search query if chosen
  const mode = searchParams.get('mode');
  const fromConstructor = searchParams.get('fromConstructor');

  // Fetch current user to auto pre-populate first author profile
  const meQuery = useMe();
  const me = meQuery.data;

  useEffect(() => {
    if (!me) return;
    setMetadataInitial((prev) => {
      if (prev.contributors?.[0]?.fullName?.trim()) return prev;
      return {
        ...prev,
        contributors: [
          {
            fullName: me.displayName || '',
            email: me.email || '',
            affiliation: me.affiliation || '',
            sortOrder: 0,
            isCorresponding: true,
          },
        ],
      };
    });
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
    if (fromConstructor !== '1') return;
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY, '1');
    } catch {
      // ignore
    }
    setConstructorManuscriptDismissed(false);
    const env = readConstructorDraftEnvelope();
    const partial = constructorContentToSubmissionMetadataInitial(env?.content);

    setMetadataInitial((prev) => ({
      ...prev,
      ...partial,
      title: partial.title ?? prev.title,
      titleAr: partial.titleAr ?? prev.titleAr,
      abstract: partial.abstract ?? prev.abstract,
      abstractAr: partial.abstractAr ?? prev.abstractAr,
      articleType: partial.articleType ?? prev.articleType,
      keywords: partial.keywords ?? prev.keywords,
      keywordsAr: partial.keywordsAr ?? prev.keywordsAr,
      contributors: partial.contributors ?? prev.contributors,
    }));
    if (partial.articleType) {
      setArticleType(partial.articleType);
      metadataFormRef.current?.setArticleType(partial.articleType);
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
      mode === 'upload' ? '/submissions/new?mode=upload' : '/submissions/new';
    router.replace(nextPath);
  }, [fromConstructor, mode, router]);

  const onCreated = useCallback(
    async (slug: string) => {
      if (typeof window !== 'undefined') {
        const shouldAttach =
          sessionStorage.getItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY) === '1';
        if (shouldAttach) {
          try {
            const env = readConstructorDraftEnvelope();
            if (env?.content?.sections?.length) {
              await apiJson(`/submissions/${encodeURIComponent(slug)}`, {
                method: 'PATCH',
                body: JSON.stringify({ constructorContent: env.content }),
              });
              clearConstructorDraftStorage();
            }
          } catch (e) {
            showApiError(e, tConstructor('attachConstructorFailed'), {
              id: 'new-submission-attach-constructor',
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
      confetti({
        particleCount: 130,
        spread: 72,
        origin: { y: 0.55 },
        colors: ['#c45c3e', '#3d5a4a', '#f4f3ee', '#d4785c', '#6a9b82'],
        disableForReducedMotion: true,
      });
      router.replace(`/submissions/${encodeURIComponent(slug)}`);
    },
    [router, showApiError, tConstructor, reviewPresentation],
  );

  function handleFilePick(
    kind: SubmissionFileKind,
    fileOrList: File | FileList | null,
  ) {
    const file = fileOrList instanceof File ? fileOrList : fileOrList?.[0];
    if (!file) return;
    if (fileExceedsUploadLimit(file)) {
      toast.error(tv('fileTooLarge', { maxMb: MAX_UPLOAD_MB }), {
        id: 'new-submission-file-too-large',
      });
      return;
    }
    if (kind === 'manuscript') {
      writePreSlugStagedManuscript(file);
    }
    clearErr(fileFieldKey(kind));
    setStagedFiles((prev) => ({ ...prev, [kind]: file }));
  }

  function clearStagedKind(kind: SubmissionFileKind) {
    setStagedFiles((prev) => {
      const next = { ...prev };
      delete next[kind];
      return next;
    });
    if (kind === 'manuscript') {
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

  const syncArticleType = useCallback(
    (value: string) => {
      setArticleType(value);
      metadataFormRef.current?.setArticleType(value);
      clearErr('articleType');
    },
    [clearErr],
  );

  // Journal lives in the form's state like the article type does, so the
  // create payload stays a single RHF submit; step 1 only mirrors it.
  const syncJournal = useCallback(
    (value: string) => {
      setJournalId(value);
      metadataFormRef.current?.setJournalId(value);
      clearErr('journalId');
    },
    [clearErr],
  );

  const collectStepErrors = useCallback(
    (currentStep: number): { errors: Set<string>; message: string | null } => {
      const errors = new Set<string>();
      let message: string | null = null;
      const setFirst = (msg: string) => {
        if (!message) message = msg;
      };

      if (currentStep === 1) {
        if (!journalId) {
          errors.add('journalId');
          setFirst(tWf('validationJournalRequired'));
        }
        if (!articleType) {
          errors.add('articleType');
          setFirst(t('validationArticleTypeRequired'));
        }
        return { errors, message };
      }

      if (currentStep === 5) {
        const hasCover = Boolean(stagedFiles.cover_letter);
        const hasTitle = Boolean(stagedFiles.title_page);
        const hasMain =
          Boolean(stagedFiles.manuscript) || showConstructorManuscript;

        if (!hasCover) {
          errors.add(fileFieldKey('cover_letter'));
          setFirst(t('validationCoverLetterRequired'));
        }
        if (!hasTitle) {
          errors.add(fileFieldKey('title_page'));
          setFirst(t('validationTitlePageRequired'));
        }
        if (!hasMain) {
          errors.add(fileFieldKey('manuscript'));
          setFirst(t('validationManuscriptRequired'));
        }
        return { errors, message };
      }

      return { errors, message };
    },
    [journalId, articleType, stagedFiles, showConstructorManuscript, t, tWf],
  );

  const validateStep = useCallback(
    async (currentStep: number): Promise<boolean> => {
      if (currentStep >= 2 && currentStep <= 4) {
        const result = await metadataFormRef.current?.validateWizardStep(
          currentStep as 2 | 3 | 4,
        );
        if (!result) return false;
        if (result.valid) {
          setFieldErrors(new Set());
          return true;
        }
        setFieldErrors(result.fieldErrors);
        if (result.message) reportValidationError(result.message);
        return false;
      }

      const { errors, message } = collectStepErrors(currentStep);
      if (errors.size === 0) return true;
      setFieldErrors(errors);
      if (message) reportValidationError(message);
      return false;
    },
    [collectStepErrors, reportValidationError],
  );

  const handleNext = async () => {
    if (await validateStep(step)) {
      setFieldErrors(new Set());
      setStep((prev) => {
        const next = prev + 1;
        setMaxStepReached((max) => Math.max(max, next));
        if (next === 6) {
          setReviewSnapshot(metadataFormRef.current?.getSnapshot() ?? null);
        }
        return next;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStepClick = async (s: number) => {
    if (s <= maxStepReached) {
      for (let i = 1; i < s; i++) {
        if (!(await validateStep(i))) return;
      }
      setStep(s);
      if (s === 6) {
        setReviewSnapshot(metadataFormRef.current?.getSnapshot() ?? null);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const clearStagedFiles = useCallback(() => {
    setStagedFiles({});
    writePreSlugStagedManuscript(null);
  }, []);

  const save = useCallback(async () => {
    setFormSaving(true);
    try {
      // Steps 1's fields live on the page while the form is unmounted, so push
      // them back in before the form validates and posts.
      metadataFormRef.current?.setArticleType(articleType);
      metadataFormRef.current?.setJournalId(journalId);

      for (let s = 1; s <= 5; s++) {
        if (!(await validateStep(s))) {
          setStep(s);
          setFormSaving(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }

      const ok = await metadataFormRef.current?.save();
      if (!ok) {
        setFormSaving(false);
        return;
      }
    } catch (e) {
      reportValidationError(resolveApiError(e, tWf('saveFailed')));
    } finally {
      setFormSaving(false);
    }
  }, [
    articleType,
    journalId,
    reportValidationError,
    resolveApiError,
    tWf,
    validateStep,
  ]);

  const tWfAny = tWf as unknown as (k: string) => string;
  const cardCls =
    'rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/60 dark:bg-white/5 backdrop-blur-md p-6 sm:p-8 shadow-sm hover:border-accent/[0.12] transition-all duration-300';

  return (
    <main className={PAGE_SHELL_NARROW}>
      {/* Top back link */}
      <Link
        href="/submissions"
        className="text-sm font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
      >
        {t('back')}
      </Link>

      {/* Main Page Title */}
      <h1 className="mt-4 font-serif text-3xl font-bold tracking-tight text-ink">
        {t('title')}
      </h1>
      <p className="mt-1 text-sm text-ink/65 mb-8">
        {t('draftStatusBeforeSave')}
      </p>

      {/* 1. Glassmorphic Wizard Step Header */}
      <div className="relative overflow-hidden rounded-2xl border border-ink/10 dark:border-white/10 bg-surface/60 dark:bg-white/5 backdrop-blur-md p-4 sm:p-6 mb-8 shadow-xs">
        <div className="absolute -right-20 -top-20 size-48 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 size-48 rounded-full bg-accent-2/5 blur-3xl" />

        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink/50 dark:text-white/40 mb-4 px-1">
          <span>{t('stepOf', { step, total: 6 })}</span>
          <span>
            {Math.round(((step - 1) / 5) * 100)}% {t('percentCompleted')}
          </span>
        </div>

        {/* Custom Progress Connectors */}
        <div className="relative flex items-center justify-between w-full px-2">
          <div className="absolute left-6 right-6 h-0.5 bg-ink/10 dark:bg-white/10 -z-10" />
          <div
            className={`absolute h-0.5 transition-all duration-300 -z-10 ${
              locale === 'ar'
                ? 'right-6 bg-gradient-to-l from-accent to-accent-2'
                : 'left-6 bg-gradient-to-r from-accent to-accent-2'
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
                    ? 'bg-gradient-to-br from-accent to-accent-2 text-paper border-transparent scale-110 shadow-md ring-4 ring-accent/20'
                    : isCompleted
                      ? 'bg-paper dark:bg-surface before:absolute before:inset-0 before:rounded-full before:bg-accent/10 before:dark:bg-accent/20 hover:before:bg-accent/20 before:pointer-events-none text-accent border-accent/40 hover:border-accent'
                      : 'bg-paper dark:bg-surface text-ink/40 dark:text-white/30 border-ink/15 dark:border-white/15 cursor-not-allowed'
                }`}
                title={t('stepTitle', { step: s })}
              >
                {isCompleted ? (
                  <Check
                    className="size-4 relative z-10"
                    strokeWidth={3}
                    aria-hidden
                  />
                ) : (
                  s
                )}

                <span
                  className={`absolute -bottom-6 left-1/2 -translate-x-1/2 hidden md:block text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-accent'
                      : isCompleted
                        ? 'text-ink/70 dark:text-white/60'
                        : 'text-ink/30 dark:text-white/20'
                  }`}
                >
                  {s === 1 && t('wizardStepPathType')}
                  {s === 2 && t('wizardStepTitleKeywords')}
                  {s === 3 && t('wizardStepAuthors')}
                  {s === 4 && t('wizardStepDeclarations')}
                  {s === 5 && t('wizardStepDocuments')}
                  {s === 6 && t('wizardStepReview')}
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
                {t('pathTypeHeading')}
              </h2>
              <p className="text-sm text-ink/65">
                {tDetail('chooseManuscriptModeHint')}
              </p>
            </div>

            {/* Custom high-end selection grid */}
            <div
              className={`grid gap-6 ${CONSTRUCTOR_ENTRY_POINTS_ENABLED ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}
            >
              {/* Constructor choice */}
              {CONSTRUCTOR_ENTRY_POINTS_ENABLED && (
                <Link
                  href="/submissions/compose/create"
                  className={`relative group rounded-xl border p-5 text-start transition-all duration-300 bg-paper/40 ${
                    showConstructorManuscript
                      ? 'border-accent ring-2 ring-accent/15'
                      : 'border-ink/10 hover:border-accent hover:bg-paper/70'
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-lg font-semibold text-ink group-hover:text-accent transition-colors">
                        {tConstructorMode('constructorTitle')}
                      </span>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                        {tConstructorMode('constructorBadge')}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-ink/75">
                      {tConstructorMode('constructorDescription')}
                    </p>

                    {/* Status Indicator */}
                    {showConstructorManuscript && constructorManuscriptName ? (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/5 px-2.5 py-1.5 rounded-lg border border-accent/10 animate-pulse">
                        <span className="size-1.5 rounded-full bg-accent" />
                        {t('constructorManuscriptBadge')}:{' '}
                        {constructorManuscriptName}
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-accent mt-2 inline-flex items-center gap-1 group-hover:underline">
                        {tManuscript('openConstructor')} →
                      </span>
                    )}
                  </div>
                </Link>
              )}

              {/* Upload choice */}
              <button
                type="button"
                onClick={() => router.push('/submissions/new?mode=upload')}
                className={`relative group rounded-xl border p-5 text-start transition-all duration-300 bg-paper/40 ${
                  mode === 'upload'
                    ? 'border-accent ring-2 ring-accent/15'
                    : 'border-ink/10 hover:border-accent hover:bg-paper/70'
                }`}
              >
                <div className="flex flex-col gap-2">
                  <span className="font-serif text-lg font-semibold text-ink group-hover:text-accent transition-colors">
                    {tConstructorMode('uploadTitle')}
                  </span>
                  <p className="text-sm leading-relaxed text-ink/75">
                    {tConstructorMode('uploadDescription')}
                  </p>

                  {/* Status Indicator */}
                  {mode === 'upload' ? (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-500/[0.04] px-2.5 py-1.5 rounded-lg border border-emerald-500/10">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {t('activeUploadPath')}
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-accent mt-2 inline-flex items-center gap-1 group-hover:underline">
                      {t('selectThisPath')} →
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* Journal selector */}
            <div className="border-t border-ink/[0.06] pt-6">
              <SubmissionJournalPicker
                value={journalId}
                onChange={syncJournal}
                invalid={hasErr('journalId')}
              />
            </div>

            {/* Article type selector */}
            <div
              className="border-t border-ink/[0.06] pt-6 flex flex-col gap-2"
              data-field-error="articleType"
            >
              <label className="text-sm font-semibold text-ink">
                {tWf('articleType')} <span className="text-red-500">*</span>
              </label>
              <SimpleSelect
                value={articleType}
                onValueChange={syncArticleType}
                placeholder={tWf('articleTypePlaceholder')}
                className={
                  hasErr('articleType')
                    ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-500/15'
                    : undefined
                }
                options={SUBMISSION_ARTICLE_TYPES.map((v) => ({
                  value: v,
                  label: tWfAny(`articleType_${v}`),
                }))}
              />
              <p className="text-xs text-ink/50 leading-relaxed">
                {t('articleTypeHint')}
              </p>
            </div>
          </section>
        )}

        {step >= 2 && (
          <section
            className={`${step <= 4 ? `${cardCls} space-y-6 animate-fade-in` : 'hidden'}`}
            aria-hidden={step > 4}
          >
            {step === 2 && (
              <div className="space-y-2">
                <h2 className="font-serif text-xl font-semibold text-ink">
                  {t('titlesKeywordsHeading')}
                </h2>
                <p className="text-sm text-ink/65">{t('titlesKeywordsHint')}</p>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-2">
                <h2 className="font-serif text-xl font-semibold text-ink">
                  {tWf('sectionAuthors')}
                </h2>
                <p className="text-sm text-ink/65">
                  {tWf('sectionAuthorsHint')}
                </p>
              </div>
            )}
            {step === 4 && (
              <div className="space-y-2">
                <h2 className="font-serif text-xl font-semibold text-ink">
                  {t('wizardStepDeclarations')}
                </h2>
                <p className="text-sm text-ink/65">
                  {tWf('sectionDeclarationsHint')}
                </p>
              </div>
            )}
            <SubmissionMetadataForm
              ref={metadataFormRef}
              createMode
              canEdit
              initial={metadataInitial}
              wizardStep={step <= 4 ? (step as 2 | 3 | 4) : undefined}
              keepMounted={step > 4}
              hideSaveButton
              hideArticleType
              hideJournal
              fieldErrors={fieldErrors}
              clearFieldError={clearErr}
              onFieldErrorsChange={setFieldErrors}
              onCreated={onCreated}
              onError={(msg) => {
                if (msg.trim()) reportValidationError(msg);
              }}
              getStagedFiles={() => stagedFiles}
              clearStagedFiles={clearStagedFiles}
              onSavingChange={setFormSaving}
            />
          </section>
        )}

        {/* Step 5: Document Uploads */}
        {step === 5 && (
          <section className={`${cardCls} space-y-6 animate-fade-in`}>
            <div className="space-y-2">
              <h2 className="font-serif text-xl font-semibold text-ink">
                {tDetail('attachedFiles')}
              </h2>
              <p className="text-sm text-ink/65">{tDetail('uploadSubtitle')}</p>
              {CONSTRUCTOR_ENTRY_POINTS_ENABLED && (
                <p className="text-xs text-ink/50">
                  {tManuscript('dualPathHint')}
                </p>
              )}
            </div>

            <div className="space-y-5">
              {FILE_KIND_ORDER.map(({ kind, required }) => {
                const staged = stagedFiles[kind];
                const showConstructorRow =
                  kind === 'manuscript' && showConstructorManuscript;

                return (
                  <div
                    key={kind}
                    data-field-error={fileFieldKey(kind)}
                    className={`${fileRowCls(hasErr(fileFieldKey(kind)), 'rounded-xl bg-paper/40 p-4 sm:p-5 shadow-2xs hover:border-accent/10 transition-colors animate-fade-in')}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-2">
                      <span className="text-sm font-bold text-ink">
                        {tWfAny(`fileKind_${kind}`)}
                        {required ? (
                          <span className="ms-1.5 rounded bg-red-50 dark:bg-red-950/20 border border-red-200/30 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                            {tWf('requiredBadge')}
                          </span>
                        ) : (
                          <span className="ms-1.5 rounded bg-ink/5 dark:bg-white/5 border border-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-ink/40">
                            {tWf('optionalBadge')}
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
                          removeLabel={t('clearStagedFile')}
                          disabled={formSaving}
                        />
                      </div>
                    ) : null}

                    {/* Staged file rendering */}
                    {staged ? (
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] p-3 text-sm border-dashed">
                        <div className="flex items-center gap-2 min-w-0">
                          <CircleCheck
                            className="size-5 shrink-0 text-emerald-600"
                            strokeWidth={2}
                            aria-hidden
                          />
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
                          {t('clearStagedFile')}
                        </button>
                      </div>
                    ) : null}

                    {/* Action buttons */}
                    <FileDropZone
                      inputId={`${fileInputId}-${kind}`}
                      accept={
                        kind === 'figure' || kind === 'table'
                          ? ACCEPT_FIGURE
                          : kind === 'supplementary'
                            ? ACCEPT_SUPPLEMENTARY
                            : ACCEPT_MANUSCRIPT
                      }
                      disabled={formSaving}
                      onFile={(file) => handleFilePick(kind, file)}
                      ariaLabel={tDetail('chooseFile')}
                      className="border-0 p-0"
                    >
                      <div className="flex flex-wrap items-center gap-3 py-1">
                        <label
                          htmlFor={`${fileInputId}-${kind}`}
                          className={`inline-flex items-center gap-1.5 cursor-pointer rounded-xl border border-ink/15 dark:border-white/15 bg-paper px-4 py-2 text-xs font-bold text-ink shadow-2xs hover:border-accent/40 active:scale-[0.98] transition-all duration-150 ${formSaving ? 'pointer-events-none opacity-50' : ''}`}
                        >
                          <Upload
                            className="size-4 opacity-70"
                            strokeWidth={2}
                            aria-hidden
                          />
                          {tDetail('chooseFile')}
                        </label>
                      </div>
                    </FileDropZone>

                    {/* Review Manuscript presentation options */}
                    {kind === 'manuscript' ? (
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
                          {t('presentationBeforeSaveHint')}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-ink/50 pt-2 border-t border-ink/[0.06]">
              {tDetail('uploadHint')}
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
                  {t('reviewHeading')}
                </h2>
                <p className="text-sm text-ink/65">{t('reviewHint')}</p>
              </div>

              {/* Grid of details */}
              <div className="space-y-6">
                {/* 1. Article Path & Type */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      1. {t('reviewSectionPathType')}
                    </span>
                    <button
                      onClick={() => setStep(1)}
                      className="text-xs font-bold text-accent hover:underline"
                    >
                      {t('edit')}
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div>
                      <span className="text-ink/50 font-semibold">
                        {tWf('journalLabel')}:
                      </span>{' '}
                      <span className="text-ink font-bold">
                        {selectedJournalTitle ?? '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink/50 font-semibold">
                        {tWf('articleType')}:
                      </span>{' '}
                      <span className="text-ink font-bold">
                        {articleType
                          ? tWfAny(`articleType_${articleType}`)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink/50 font-semibold">
                        {t('manuscriptSource')}
                      </span>{' '}
                      <span className="text-ink font-bold">
                        {showConstructorManuscript
                          ? t('sourceConstructor')
                          : t('sourceUpload')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Metadata English & Arabic */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      2. {t('reviewSectionTitlesKeywords')}
                    </span>
                    <button
                      onClick={() => setStep(2)}
                      className="text-xs font-bold text-accent hover:underline"
                    >
                      {t('edit')}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-ink/40 uppercase">
                        {t('englishMetadata')}
                      </span>
                      <h3 className="font-serif text-base font-bold text-ink leading-snug">
                        {reviewSnapshot?.title}
                      </h3>
                      <p className="text-xs text-ink/75 whitespace-pre-wrap leading-relaxed font-sans">
                        {reviewSnapshot?.abstract}
                      </p>
                    </div>

                    {reviewSnapshot?.titleAr.trim() && (
                      <div
                        className="space-y-1 pt-3 border-t border-ink/[0.04]"
                        dir="rtl"
                      >
                        <span className="text-xs font-bold text-ink/40 uppercase">
                          {t('arabicMetadata')}
                        </span>
                        <h3 className="font-serif text-base font-bold text-ink leading-snug">
                          {reviewSnapshot.titleAr}
                        </h3>
                        <p className="text-xs text-ink/75 whitespace-pre-wrap leading-relaxed font-sans">
                          {reviewSnapshot.abstractAr}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 pt-3 border-t border-ink/[0.04] text-sm">
                      <div>
                        <span className="text-ink/50 font-semibold">
                          {t('englishKeywords')}
                        </span>{' '}
                        <span className="text-ink font-medium">
                          {reviewSnapshot?.keywordTags.join(', ')}
                        </span>
                      </div>
                      {(reviewSnapshot?.keywordTagsAr.length ?? 0) > 0 && (
                        <div dir="rtl">
                          <span className="text-ink/50 font-semibold">
                            {t('arabicKeywords')}
                          </span>{' '}
                          <span className="text-ink font-medium">
                            {reviewSnapshot?.keywordTagsAr.join('، ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Authors List */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      3. {tWf('sectionAuthors')}
                    </span>
                    <button
                      onClick={() => setStep(3)}
                      className="text-xs font-bold text-accent hover:underline"
                    >
                      {t('edit')}
                    </button>
                  </div>

                  <ul className="space-y-2.5">
                    {(reviewSnapshot?.contributors ?? []).map((c, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm bg-paper/20 p-2.5 rounded-lg border border-ink/[0.03]"
                      >
                        <div>
                          <span className="font-bold text-ink">
                            {c.fullName}
                          </span>
                          {c.email && (
                            <span className="text-xs text-ink/50 ms-2">
                              ({c.email})
                            </span>
                          )}
                          <p className="text-xs text-ink/65 mt-0.5">
                            {c.affiliation}
                          </p>
                        </div>
                        {c.isCorresponding && (
                          <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                            {tWf('correspondingAuthor')}
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
                      4. {t('wizardStepDeclarations')}
                    </span>
                    <button
                      onClick={() => setStep(4)}
                      className="text-xs font-bold text-accent hover:underline"
                    >
                      {t('edit')}
                    </button>
                  </div>

                  <div className="space-y-3 text-sm">
                    {reviewSnapshot?.fundingStatement.trim() && (
                      <div className="pt-2 border-t border-ink/[0.04]">
                        <span className="text-ink/50 font-semibold">
                          {tWf('fundingStatement')}:
                        </span>{' '}
                        <p className="text-xs text-ink/80 mt-0.5 whitespace-pre-wrap">
                          {reviewSnapshot.fundingStatement}
                        </p>
                      </div>
                    )}

                    {reviewSnapshot?.conflictOfInterestStatement.trim() && (
                      <div className="pt-2 border-t border-ink/[0.04]">
                        <span className="text-ink/50 font-semibold">
                          {tWf('conflictOfInterest')}:
                        </span>{' '}
                        <p className="text-xs text-ink/80 mt-0.5 whitespace-pre-wrap">
                          {reviewSnapshot.conflictOfInterestStatement}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Document List */}
                <div className="bg-paper/40 p-4 rounded-xl border border-ink/[0.06]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent">
                      5. {tDetail('attachedFiles')}
                    </span>
                    <button
                      onClick={() => setStep(5)}
                      className="text-xs font-bold text-accent hover:underline"
                    >
                      {t('edit')}
                    </button>
                  </div>

                  <ul className="space-y-2 text-sm">
                    {/* Cover letter */}
                    <li className="flex items-center justify-between py-1.5 border-b border-ink/[0.04] last:border-0">
                      <span className="font-semibold text-ink">
                        {tWf('fileKind_cover_letter')}:
                      </span>
                      <span className="text-xs text-ink/60 truncate max-w-[200px]">
                        {stagedFiles.cover_letter?.name || '—'}
                      </span>
                    </li>
                    {/* Title page */}
                    <li className="flex items-center justify-between py-1.5 border-b border-ink/[0.04] last:border-0">
                      <span className="font-semibold text-ink">
                        {tWf('fileKind_title_page')}:
                      </span>
                      <span className="text-xs text-ink/60 truncate max-w-[200px]">
                        {stagedFiles.title_page?.name || '—'}
                      </span>
                    </li>
                    {/* Manuscript */}
                    <li className="flex items-center justify-between py-1.5 border-b border-ink/[0.04] last:border-0">
                      <span className="font-semibold text-ink">
                        {tDetail('manuscript')}:
                      </span>
                      <span className="text-xs text-ink/60 truncate max-w-[200px]">
                        {showConstructorManuscript
                          ? `[Word Constructor] ${constructorManuscriptName}`
                          : stagedFiles.manuscript?.name || '—'}
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
            <Button
              variant="secondary"
              disabled={formSaving}
              onClick={handleBack}
              className="px-6 py-3"
            >
              {t('back')}
            </Button>
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
              {t('next')}
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
                t('createDraft')
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
  if (typeof window === 'undefined') return false;
  try {
    return (
      sessionStorage.getItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY) === '1'
    );
  } catch {
    return false;
  }
}

function clearConstructorAttachIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CONSTRUCTOR_ATTACH_INTENT_SESSION_KEY);
  } catch {
    // ignore
  }
}
