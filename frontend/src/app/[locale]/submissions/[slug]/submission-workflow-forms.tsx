'use client';

import { useTranslations } from 'next-intl';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  type FieldErrors,
  type Resolver,
} from 'react-hook-form';
import { apiJson, apiUpload } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useApiErrorMessages } from '@/lib/use-api-error-messages';
import { SimpleSelect } from '@/components/ui/select';
import {
  KeywordTagsDisplay,
  KeywordTagsInput,
} from '@/components/ui/keyword-tags-input';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { parseKeywordsFromStorage, serializeKeywords } from '@/lib/keywords';
import {
  addAllSuggestedKeywords,
  addSuggestedKeyword,
  KeywordSuggestionChips,
  notifyKeywordAddFailure,
  SubmissionKeywordSuggest,
  type KeywordSuggestionResult,
} from '@/components/submission-keyword-suggest';
import {
  contributorFieldKey,
  fieldInputCls,
  hasFieldError,
  metadataFormFieldForUiKey,
  rhfErrorsToBulletMessage,
  rhfErrorsToFieldErrorSet,
  schemaFieldToUiErrorKey,
} from '@/lib/submission-field-errors';
import type { z } from 'zod';
import {
  ABSTRACT_MAX_WORDS,
  countWords,
  createSubmissionSchema,
  submissionMetadataPatchSchema,
  SUBMISSION_ARTICLE_TYPES,
  translatedZodResolver,
} from '@/lib/validation';

type MetadataPayload = z.infer<typeof createSubmissionSchema>;
import { SubmissionDisciplinePanel } from '@/components/submission-discipline-panel';
import { SubmissionJournalPicker } from '@/components/submission-journal-picker';
import type { SubmissionDisciplineFields } from '@/lib/discipline-labels';
import { DisciplineBadges } from '@/components/discipline-badges';

export type ContributorRow = {
  fullName: string;
  email?: string;
  affiliation: string;
  sortOrder: number;
  isCorresponding: boolean;
};

export type SubmissionMetadataFormInitial = {
  /** Journal id — required on create, and always present on an existing draft. */
  journalId: string;
  title: string;
  titleAr: string;
  abstract: string;
  abstractAr: string;
  articleType: string | null;
  keywords: string | null;
  keywordsAr: string | null;
  contributors: ContributorRow[] | null;
  fundingStatement: string | null;
  conflictOfInterestStatement: string | null;
  ethicalApprovalReference: string | null;
  originalityConfirmed: boolean;
  aiUsageStatement: string | null;
  disciplines?: string[] | null;
  disciplineSource?: string | null;
  disciplineSuggestedLabels?: string[] | null;
  disciplineSuggestedConfidence?: number | null;
  disciplineScopeInJournal?: boolean | null;
  disciplineScopeWarning?: string | null;
};

export const FILE_KIND_ORDER = [
  { kind: 'cover_letter', required: true },
  { kind: 'title_page', required: true },
  { kind: 'manuscript', required: true },
  { kind: 'figure', required: false },
  { kind: 'table', required: false },
  { kind: 'supplementary', required: false },
] as const;

export type SubmissionFileKind = (typeof FILE_KIND_ORDER)[number]['kind'];

/** File upload rows for the submission detail page (all kinds, including manuscript). */
export function fileKindsForSubmissionDetail(_isConstructor?: boolean) {
  return [...FILE_KIND_ORDER];
}

type SubmissionFieldErrorProps = {
  fieldErrors?: Set<string>;
  clearFieldError?: (key: string) => void;
  onFieldErrorsChange?: (errors: Set<string>) => void;
};

type SubmissionMetadataFormProps = SubmissionFieldErrorProps &
  (
    | {
        createMode: true;
        canEdit: true;
        initial: SubmissionMetadataFormInitial;
        onCreated: (slug: string) => void;
        onError: (msg: string) => void;
        /** Overrides the default “Save metadata” label (e.g. “Save draft” on /new). */
        saveButtonLabel?: string;
        /** Staged files on /submissions/new; uploaded after POST /submissions succeeds. */
        getStagedFiles?: () => Partial<Record<SubmissionFileKind, File>>;
        clearStagedFiles?: () => void;
        onSavingChange?: (busy: boolean) => void;
        /** When set, only the matching wizard section is rendered (new-submission flow). */
        wizardStep?: 2 | 3 | 4;
        /** Keep RHF state mounted while the wizard shows other steps. */
        keepMounted?: boolean;
        hideSaveButton?: boolean;
        /** Article type is collected on wizard step 1 instead of inside the form. */
        hideArticleType?: boolean;
        /** Journal is collected on wizard step 1 instead of inside the form. */
        hideJournal?: boolean;
      }
    | {
        createMode?: false;
        slug: string;
        canEdit: boolean;
        initial: SubmissionMetadataFormInitial;
        onSaved: () => void;
        onError: (msg: string) => void;
        saveButtonLabel?: string;
        onDisciplineUpdated?: () => void;
      }
  );

export type SubmissionMetadataWizardSnapshot = SubmissionMetadataFormValues & {
  keywordTags: string[];
  keywordTagsAr: string[];
};

export type WizardStepValidation = {
  valid: boolean;
  fieldErrors: Set<string>;
  message: string | null;
};

export type SubmissionMetadataFormHandle = {
  save: (opts?: { silent?: boolean }) => Promise<boolean>;
  validateWizardStep: (step: 2 | 3 | 4) => Promise<WizardStepValidation>;
  getSnapshot: () => SubmissionMetadataWizardSnapshot;
  mergeInitial: (partial: Partial<SubmissionMetadataFormInitial>) => void;
  setArticleType: (value: string) => void;
  setJournalId: (value: string) => void;
};

export function emptySubmissionMetadataInitial(): SubmissionMetadataFormInitial {
  return {
    journalId: '',
    title: '',
    titleAr: '',
    abstract: '',
    abstractAr: '',
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
}

type SubmissionMetadataFormValues = {
  journalId: string;
  title: string;
  titleAr: string;
  abstract: string;
  abstractAr: string;
  articleType: string;
  fundingStatement: string;
  conflictOfInterestStatement: string;
  ethicalApprovalReference: string;
  originalityConfirmed: boolean;
  aiUsageStatement: string;
  contributors: ContributorRow[];
};

function defaultContributorRow(
  sortOrder = 0,
  isCorresponding = sortOrder === 0,
): ContributorRow {
  return {
    fullName: '',
    email: '',
    affiliation: '',
    sortOrder,
    isCorresponding,
  };
}

function initialContributors(
  initial: SubmissionMetadataFormInitial,
): ContributorRow[] {
  if (initial.contributors?.length) {
    return initial.contributors.map((c, i) => ({
      fullName: c.fullName,
      email: c.email ?? '',
      affiliation: c.affiliation,
      sortOrder: c.sortOrder ?? i,
      isCorresponding: c.isCorresponding,
    }));
  }
  return [defaultContributorRow()];
}

function initialToFormValues(
  initial: SubmissionMetadataFormInitial,
): SubmissionMetadataFormValues {
  return {
    journalId: initial.journalId ?? '',
    title: initial.title,
    titleAr: initial.titleAr,
    abstract: initial.abstract,
    abstractAr: initial.abstractAr,
    articleType: initial.articleType ?? '',
    fundingStatement: initial.fundingStatement ?? '',
    conflictOfInterestStatement: initial.conflictOfInterestStatement ?? '',
    ethicalApprovalReference: initial.ethicalApprovalReference ?? '',
    originalityConfirmed: initial.originalityConfirmed,
    aiUsageStatement: initial.aiUsageStatement ?? '',
    contributors: initialContributors(initial),
  };
}

function keywordsWithDraft(tags: string[], draft: string): string[] {
  const trimmed = draft.trim();
  if (!trimmed) return tags;
  const lower = trimmed.toLowerCase();
  if (tags.some((x) => x.toLowerCase() === lower)) return tags;
  return [...tags, trimmed];
}

export const SubmissionMetadataForm = forwardRef<
  SubmissionMetadataFormHandle,
  SubmissionMetadataFormProps
>(function SubmissionMetadataForm(props, ref) {
  const isCreate = props.createMode === true;
  const slug = !isCreate ? props.slug : '';
  const canEdit = isCreate ? true : props.canEdit;
  const initial = props.initial;
  const onError = props.onError;
  const saveLabelOverride = props.saveButtonLabel;
  const onSavedNext =
    'onSaved' in props && props.onSaved ? props.onSaved : undefined;
  const onCreatedNext =
    'onCreated' in props && props.onCreated ? props.onCreated : undefined;
  const getStagedFiles =
    isCreate && 'getStagedFiles' in props ? props.getStagedFiles : undefined;
  const clearStagedFiles =
    isCreate && 'clearStagedFiles' in props
      ? props.clearStagedFiles
      : undefined;
  const onSavingChange =
    isCreate && 'onSavingChange' in props ? props.onSavingChange : undefined;
  const wizardStep =
    isCreate && 'wizardStep' in props ? props.wizardStep : undefined;
  const keepMounted =
    isCreate && 'keepMounted' in props ? props.keepMounted : false;
  const hideSaveButton =
    isCreate && 'hideSaveButton' in props ? props.hideSaveButton : false;
  const hideArticleType =
    isCreate && 'hideArticleType' in props ? props.hideArticleType : false;
  const hideJournal =
    isCreate && 'hideJournal' in props ? props.hideJournal : false;
  const inputVariant = wizardStep ? 'wizard' : 'form';
  const showMetadataSection = !wizardStep || wizardStep === 2;
  const showAuthorsSection = !wizardStep || wizardStep === 3;
  const showDeclarationsSection = !wizardStep || wizardStep === 4;
  const onDisciplineUpdated =
    !isCreate && 'onDisciplineUpdated' in props
      ? props.onDisciplineUpdated
      : undefined;
  const externalFieldErrors = props.fieldErrors;
  const clearFieldErrorProp = props.clearFieldError;
  const onFieldErrorsChange = props.onFieldErrorsChange;

  const [localFieldErrors, setLocalFieldErrors] = useState<Set<string>>(
    () => new Set(),
  );
  const activeFieldErrors = externalFieldErrors ?? localFieldErrors;

  const clearErr = useCallback(
    (key: string) => {
      if (clearFieldErrorProp) {
        clearFieldErrorProp(key);
        return;
      }
      setLocalFieldErrors((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [clearFieldErrorProp],
  );

  const applyFieldErrors = useCallback(
    (errors: Set<string>) => {
      if (onFieldErrorsChange) {
        onFieldErrorsChange(errors);
      } else {
        setLocalFieldErrors(errors);
      }
    },
    [onFieldErrorsChange],
  );

  const t = useTranslations('SubmissionWorkflow');
  const tv = useTranslations('Validation');
  const tNew = useTranslations('SubmissionsNew');
  const tDetail = useTranslations('SubmissionDetail');
  const { resolve: resolveApiError } = useApiErrorMessages();

  const [keywordTags, setKeywordTags] = useState<string[]>(() =>
    parseKeywordsFromStorage(initial.keywords),
  );
  const [keywordDraft, setKeywordDraft] = useState('');
  const [keywordTagsAr, setKeywordTagsAr] = useState<string[]>(() =>
    parseKeywordsFromStorage(initial.keywordsAr),
  );
  const [keywordDraftAr, setKeywordDraftAr] = useState('');
  const [suggestedKeywordsEn, setSuggestedKeywordsEn] = useState<string[]>([]);
  const [suggestedKeywordsAr, setSuggestedKeywordsAr] = useState<string[]>([]);

  const metadataSchema = isCreate
    ? createSubmissionSchema
    : submissionMetadataPatchSchema;

  const preprocessMetadata = useCallback(
    (values: unknown) => {
      const v = values as SubmissionMetadataFormValues;
      return {
        ...v,
        title: v.title.trim(),
        titleAr: v.titleAr.trim(),
        abstract: v.abstract.trim(),
        abstractAr: v.abstractAr.trim(),
        keywords:
          serializeKeywords(keywordsWithDraft(keywordTags, keywordDraft)) ||
          undefined,
        keywordsAr:
          serializeKeywords(keywordsWithDraft(keywordTagsAr, keywordDraftAr)) ||
          undefined,
        fundingStatement: v.fundingStatement.trim() || undefined,
        conflictOfInterestStatement:
          v.conflictOfInterestStatement.trim() || undefined,
        ethicalApprovalReference:
          v.ethicalApprovalReference.trim() || undefined,
        aiUsageStatement: v.aiUsageStatement.trim() || undefined,
        articleType: v.articleType || undefined,
        contributors: v.contributors.map((c, i) => ({
          fullName: c.fullName.trim(),
          email: c.email?.trim() || undefined,
          affiliation: c.affiliation.trim(),
          sortOrder: i,
          isCorresponding: c.isCorresponding,
        })),
      };
    },
    [keywordTags, keywordDraft, keywordTagsAr, keywordDraftAr],
  );

  const resolver = useMemo(
    () => translatedZodResolver(metadataSchema, tv, preprocessMetadata),
    [metadataSchema, tv, preprocessMetadata],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    clearErrors,
    setError,
    trigger,
    getValues,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<SubmissionMetadataFormValues>({
    resolver: resolver as Resolver<SubmissionMetadataFormValues>,
    defaultValues: initialToFormValues(initial),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'contributors',
  });

  const title = watch('title');
  const titleAr = watch('titleAr');
  const abstract = watch('abstract');
  const abstractAr = watch('abstractAr');
  const contributors = watch('contributors');

  const initialContributorsKey = JSON.stringify(initial.contributors ?? []);

  useEffect(() => {
    reset(initialToFormValues(initial));
    setKeywordTags(parseKeywordsFromStorage(initial.keywords));
    setKeywordDraft('');
    setKeywordTagsAr(parseKeywordsFromStorage(initial.keywordsAr));
    setKeywordDraftAr('');
  }, [
    initial.title,
    initial.titleAr,
    initial.abstract,
    initial.abstractAr,
    initial.articleType,
    initial.keywords,
    initial.keywordsAr,
    initial.fundingStatement,
    initial.conflictOfInterestStatement,
    initial.ethicalApprovalReference,
    initial.originalityConfirmed,
    initial.aiUsageStatement,
    initialContributorsKey,
    reset,
  ]);

  useEffect(() => {
    onSavingChange?.(isSubmitting);
  }, [isSubmitting, onSavingChange]);

  const rhfFieldErrors = useMemo(
    () => rhfErrorsToFieldErrorSet(errors),
    [errors],
  );

  const combinedFieldErrors = useMemo(() => {
    const next = new Set(activeFieldErrors);
    for (const key of rhfFieldErrors) next.add(key);
    return next;
  }, [activeFieldErrors, rhfFieldErrors]);

  const hasErr = useCallback(
    (key: string) => hasFieldError(combinedFieldErrors, key),
    [combinedFieldErrors],
  );

  const clearFormErr = useCallback(
    (key: string) => {
      clearErr(key);
      clearErrors(
        metadataFormFieldForUiKey(key) as keyof SubmissionMetadataFormValues,
      );
    },
    [clearErr, clearErrors],
  );

  const onInvalid = useCallback(
    (formErrors: FieldErrors<SubmissionMetadataFormValues>) => {
      applyFieldErrors(rhfErrorsToFieldErrorSet(formErrors));
      onError(rhfErrorsToBulletMessage(formErrors));
    },
    [applyFieldErrors, onError],
  );

  const persistMetadata = useCallback(
    async (
      data: MetadataPayload,
      opts?: { silent?: boolean },
    ): Promise<boolean> => {
      onError('');
      try {
        if (isCreate) {
          const created = await apiJson<{ id: string; slug: string }>(
            '/submissions',
            {
              method: 'POST',
              body: JSON.stringify(data),
            },
          );
          const createdSlug = created.slug;
          const staged = getStagedFiles?.() ?? {};
          let uploadErr: string | null = null;
          for (const { kind } of FILE_KIND_ORDER) {
            const file = staged[kind];
            if (!file) continue;
            try {
              await apiUpload(
                `/submissions/${encodeURIComponent(createdSlug)}/files`,
                file,
                { kind },
              );
            } catch (e) {
              if (!uploadErr) {
                uploadErr = resolveApiError(e, tDetail('uploadFailed'));
              }
            }
          }
          if (!opts?.silent) {
            toast.success(t('draftCreated'), {
              id: 'submission-metadata-draft-created',
            });
          }
          if (uploadErr) onError(uploadErr);
          clearStagedFiles?.();
          await Promise.resolve(onCreatedNext?.(createdSlug));
          return true;
        }

        await apiJson(`/submissions/${encodeURIComponent(slug)}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
        if (!opts?.silent) {
          toast.success(t('saveSuccess'), {
            id: 'submission-metadata-save-success',
          });
        }
        onSavedNext?.();
        return true;
      } catch (e) {
        onError(resolveApiError(e, t('saveFailed')));
        return false;
      }
    },
    [
      isCreate,
      slug,
      onError,
      onSavedNext,
      onCreatedNext,
      getStagedFiles,
      clearStagedFiles,
      t,
      tDetail,
      resolveApiError,
    ],
  );

  const save = useCallback(
    (opts?: { silent?: boolean }) =>
      new Promise<boolean>((resolve) => {
        handleSubmit(
          async (data) => {
            const ok = await persistMetadata(data as MetadataPayload, opts);
            resolve(ok);
          },
          (formErrors) => {
            onInvalid(formErrors);
            resolve(false);
          },
        )();
      }),
    [handleSubmit, persistMetadata, onInvalid],
  );

  function setCorresponding(idx: number) {
    fields.forEach((_, i) => {
      setValue(`contributors.${i}.isCorresponding`, i === idx);
    });
    clearFormErr('corresponding');
    clearFormErr('contributors');
  }

  function addContributor() {
    append(defaultContributorRow(fields.length, false));
  }

  function removeContributor(idx: number) {
    const wasCorresponding = contributors[idx]?.isCorresponding;
    remove(idx);
    if (wasCorresponding) {
      const after = watch('contributors');
      after.forEach((_, i) => {
        setValue(`contributors.${i}.isCorresponding`, i === 0);
      });
    }
  }

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

  const mergeInitial = useCallback(
    (partial: Partial<SubmissionMetadataFormInitial>) => {
      const current = getValues();
      const merged: SubmissionMetadataFormInitial = {
        ...initial,
        journalId: partial.journalId ?? current.journalId,
        title: partial.title ?? current.title,
        titleAr: partial.titleAr ?? current.titleAr,
        abstract: partial.abstract ?? current.abstract,
        abstractAr: partial.abstractAr ?? current.abstractAr,
        articleType: partial.articleType ?? current.articleType ?? null,
        keywords: partial.keywords ?? serializeKeywords(keywordTags) ?? null,
        keywordsAr:
          partial.keywordsAr ?? serializeKeywords(keywordTagsAr) ?? null,
        contributors:
          partial.contributors ??
          current.contributors.map((c, i) => ({
            ...c,
            sortOrder: c.sortOrder ?? i,
          })),
        fundingStatement:
          partial.fundingStatement ?? current.fundingStatement ?? null,
        conflictOfInterestStatement:
          partial.conflictOfInterestStatement ??
          current.conflictOfInterestStatement ??
          null,
        ethicalApprovalReference:
          partial.ethicalApprovalReference ??
          current.ethicalApprovalReference ??
          null,
        originalityConfirmed:
          partial.originalityConfirmed ?? current.originalityConfirmed,
        aiUsageStatement:
          partial.aiUsageStatement ?? current.aiUsageStatement ?? null,
      };
      reset(initialToFormValues(merged));
      if (partial.keywords !== undefined) {
        setKeywordTags(parseKeywordsFromStorage(partial.keywords));
        setKeywordDraft('');
      }
      if (partial.keywordsAr !== undefined) {
        setKeywordTagsAr(parseKeywordsFromStorage(partial.keywordsAr));
        setKeywordDraftAr('');
      }
    },
    [getValues, initial, keywordTags, keywordTagsAr, reset],
  );

  const setArticleType = useCallback(
    (value: string) => {
      setValue('articleType', value);
      clearFormErr('articleType');
    },
    [setValue, clearFormErr],
  );

  const setJournalId = useCallback(
    (value: string) => {
      setValue('journalId', value);
      clearFormErr('journalId');
    },
    [setValue, clearFormErr],
  );

  const getSnapshot = useCallback((): SubmissionMetadataWizardSnapshot => {
    const values = getValues();
    return {
      ...values,
      keywordTags: keywordsWithDraft(keywordTags, keywordDraft),
      keywordTagsAr: keywordsWithDraft(keywordTagsAr, keywordDraftAr),
    };
  }, [getValues, keywordTags, keywordDraft, keywordTagsAr, keywordDraftAr]);

  const validateWizardStep = useCallback(
    async (stepNum: 2 | 3 | 4): Promise<WizardStepValidation> => {
      const fieldErrors = new Set<string>();
      let message: string | null = null;
      const setFirst = (msg: string) => {
        if (!message) message = msg;
      };

      if (stepNum === 2) {
        const ok = await trigger([
          'title',
          'titleAr',
          'abstract',
          'abstractAr',
        ]);
        const values = getValues();
        const kw = keywordsWithDraft(keywordTags, keywordDraft);
        const kwAr = keywordsWithDraft(keywordTagsAr, keywordDraftAr);
        if (kw.length < 3 || kw.length > 6) {
          (
            setError as (
              name: string,
              error: { type: string; message: string },
            ) => void
          )('keywords', {
            type: 'manual',
            message: tNew('validationKeywordsEnRange'),
          });
          fieldErrors.add('keywords');
          setFirst(tNew('validationKeywordsEnRange'));
        } else {
          (clearErrors as (name?: string | string[]) => void)('keywords');
        }
        if (values.titleAr.trim() && (kwAr.length < 3 || kwAr.length > 6)) {
          (
            setError as (
              name: string,
              error: { type: string; message: string },
            ) => void
          )('keywordsAr', {
            type: 'manual',
            message: tNew('validationKeywordsArRange'),
          });
          fieldErrors.add('keywordsAr');
          setFirst(tNew('validationKeywordsArRange'));
        } else {
          (clearErrors as (name?: string | string[]) => void)('keywordsAr');
        }
        if (!ok) {
          for (const name of [
            'title',
            'titleAr',
            'abstract',
            'abstractAr',
          ] as const) {
            const err = getFieldState(name).error?.message;
            if (err) setFirst(String(err));
            fieldErrors.add(schemaFieldToUiErrorKey(name));
          }
        }
      }

      if (stepNum === 3) {
        const rows = getValues().contributors;
        const fieldsToTrigger = rows.flatMap((_, i) => [
          `contributors.${i}.fullName` as const,
          `contributors.${i}.affiliation` as const,
          `contributors.${i}.email` as const,
        ]);
        const ok = await trigger(fieldsToTrigger);
        const correspondingCount = rows.filter((r) => r.isCorresponding).length;
        if (rows.length === 0) {
          (
            setError as (
              name: string,
              error: { type: string; message: string },
            ) => void
          )('contributors', {
            type: 'manual',
            message: tNew('validationAuthorsRequired'),
          });
          fieldErrors.add('contributors');
          setFirst(tNew('validationAuthorsRequired'));
        } else {
          (clearErrors as (name?: string | string[]) => void)('contributors');
        }
        if (correspondingCount !== 1) {
          (
            setError as (
              name: string,
              error: { type: string; message: string },
            ) => void
          )('corresponding', {
            type: 'manual',
            message: tNew('validationCorrespondingAuthorRequired'),
          });
          fieldErrors.add('corresponding');
          setFirst(tNew('validationCorrespondingAuthorRequired'));
        } else {
          (clearErrors as (name?: string | string[]) => void)('corresponding');
        }
        if (!ok) {
          rows.forEach((_, i) => {
            for (const suffix of [
              'fullName',
              'affiliation',
              'email',
            ] as const) {
              const path = `contributors.${i}.${suffix}` as const;
              const err = getFieldState(path).error?.message;
              if (err) {
                setFirst(String(err));
                fieldErrors.add(
                  suffix === 'fullName' || suffix === 'affiliation'
                    ? contributorFieldKey(i, suffix)
                    : contributorFieldKey(i, 'email'),
                );
              }
            }
          });
        }
      }

      if (stepNum === 4) {
        if (!getValues().originalityConfirmed) {
          setError('originalityConfirmed', {
            type: 'manual',
            message: tNew('validationOriginalityRequired'),
          });
          fieldErrors.add('originality');
          setFirst(tNew('validationOriginalityRequired'));
        } else {
          clearErrors('originalityConfirmed');
        }
      }

      if (fieldErrors.size > 0) {
        applyFieldErrors(fieldErrors);
      }

      return {
        valid: fieldErrors.size === 0,
        fieldErrors,
        message,
      };
    },
    [
      trigger,
      getValues,
      keywordTags,
      keywordDraft,
      keywordTagsAr,
      keywordDraftAr,
      getFieldState,
      applyFieldErrors,
      setError,
      clearErrors,
      tNew,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      save,
      validateWizardStep,
      getSnapshot,
      mergeInitial,
      setArticleType,
      setJournalId,
    }),
    [
      save,
      validateWizardStep,
      getSnapshot,
      mergeInitial,
      setArticleType,
      setJournalId,
    ],
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
      max: t('keywordSuggestMax'),
      duplicate: t('keywordSuggestDuplicate'),
      tooLong: t('keywordSuggestTooLong'),
      addAllNone: t('keywordSuggestAddAllNone'),
    }),
    [t],
  );

  const addEnKeyword = useCallback(
    (kw: string) => {
      setKeywordTags((tags) => {
        const result = addSuggestedKeyword(tags, kw, 'en');
        if (result.addedCount > 0) return result.tags;
        notifyKeywordAddFailure(result.failure, keywordAddMessages);
        return tags;
      });
    },
    [keywordAddMessages],
  );

  const addAllEnKeywords = useCallback(() => {
    setKeywordTags((tags) => {
      const result = addAllSuggestedKeywords(tags, suggestedKeywordsEn, 'en');
      if (result.addedCount > 0) return result.tags;
      notifyKeywordAddFailure(result.failure, keywordAddMessages);
      return tags;
    });
  }, [suggestedKeywordsEn, keywordAddMessages]);

  const addArKeyword = useCallback(
    (kw: string) => {
      setKeywordTagsAr((tags) => {
        const result = addSuggestedKeyword(tags, kw, 'ar');
        if (result.addedCount > 0) return result.tags;
        notifyKeywordAddFailure(result.failure, keywordAddMessages);
        return tags;
      });
    },
    [keywordAddMessages],
  );

  const addAllArKeywords = useCallback(() => {
    setKeywordTagsAr((tags) => {
      const result = addAllSuggestedKeywords(tags, suggestedKeywordsAr, 'ar');
      if (result.addedCount > 0) return result.tags;
      notifyKeywordAddFailure(result.failure, keywordAddMessages);
      return tags;
    });
  }, [suggestedKeywordsAr, keywordAddMessages]);

  if (!canEdit) {
    return <SubmissionMetadataDisplay initial={initial} />;
  }

  if (keepMounted && !wizardStep) {
    return null;
  }

  return (
    <div className={wizardStep ? '' : 'space-y-8'}>
      {showMetadataSection ? (
        <div>
          {!wizardStep ? (
            <>
              <h3 className="font-serif text-lg font-semibold text-ink">
                {t('sectionMetadata')}
              </h3>
              <p className="mt-1 text-sm text-ink/65">
                {t('sectionMetadataHint')}
              </p>
            </>
          ) : null}
          <div
            className={
              wizardStep ? 'flex flex-col gap-4' : 'mt-4 flex flex-col gap-4'
            }
          >
            {!hideJournal ? (
              <Controller
                name="journalId"
                control={control}
                render={({ field }) => (
                  <SubmissionJournalPicker
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      clearFormErr('journalId');
                    }}
                    disabled={!canEdit}
                    invalid={hasErr('journalId')}
                  />
                )}
              />
            ) : null}
            {!hideArticleType ? (
              <label
                className="flex flex-col gap-1 text-sm"
                data-field-error="articleType"
              >
                <span className="font-medium text-ink">{t('articleType')}</span>
                <Controller
                  name="articleType"
                  control={control}
                  render={({ field }) => (
                    <SimpleSelect
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        clearFormErr('articleType');
                      }}
                      placeholder={t('articleTypePlaceholder')}
                      className={
                        hasErr('articleType')
                          ? 'border-red-400 focus-visible:border-red-400 focus-visible:ring-red-500/15'
                          : undefined
                      }
                      options={SUBMISSION_ARTICLE_TYPES.map((v) => ({
                        value: v,
                        label: t(`articleType_${v}`),
                      }))}
                    />
                  )}
                />
              </label>
            ) : null}
            <label
              className="flex flex-col gap-1 text-sm"
              data-field-error="title"
            >
              <span className="font-medium text-ink">{t('titleLabelEn')}</span>
              <Input
                {...register('title', {
                  onChange: () => clearFormErr('title'),
                })}
                dir="ltr"
                error={hasErr('title')}
                aria-invalid={hasErr('title')}
                className={fieldInputCls(hasErr('title'), inputVariant)}
              />
            </label>
            <label
              className="flex flex-col gap-1 text-sm"
              data-field-error="titleAr"
            >
              <span className="font-medium text-ink">{t('titleLabelAr')}</span>
              <Input
                {...register('titleAr', {
                  onChange: () => clearFormErr('titleAr'),
                })}
                dir="rtl"
                error={hasErr('titleAr')}
                aria-invalid={hasErr('titleAr')}
                className={fieldInputCls(hasErr('titleAr'), inputVariant)}
              />
            </label>
            <label
              className="flex flex-col gap-1 text-sm"
              data-field-error="abstract"
            >
              <span className="font-medium text-ink">
                {t('abstractLabelEn')}
              </span>
              <textarea
                {...register('abstract', {
                  onChange: () => clearFormErr('abstract'),
                })}
                rows={6}
                dir="ltr"
                aria-invalid={hasErr('abstract')}
                className={fieldInputCls(hasErr('abstract'), inputVariant)}
              />
              <span className="text-xs text-ink/55">
                {t('abstractWordCount', {
                  count: countWords(abstract),
                  max: ABSTRACT_MAX_WORDS,
                })}
              </span>
            </label>
            <label
              className="flex flex-col gap-1 text-sm"
              data-field-error="abstractAr"
            >
              <span className="font-medium text-ink">
                {t('abstractLabelAr')}
              </span>
              <textarea
                {...register('abstractAr', {
                  onChange: () => clearFormErr('abstractAr'),
                })}
                rows={6}
                dir="rtl"
                aria-invalid={hasErr('abstractAr')}
                className={fieldInputCls(hasErr('abstractAr'), inputVariant)}
              />
              <span className="text-xs text-ink/55">
                {t('abstractWordCount', {
                  count: countWords(abstractAr),
                  max: ABSTRACT_MAX_WORDS,
                })}
              </span>
            </label>
            {isCreate ? (
              <SubmissionKeywordSuggest
                previewInput={keywordPreviewInput}
                canSuggest={canSuggestKeywords}
                suggestedEn={suggestedKeywordsEn}
                suggestedAr={suggestedKeywordsAr}
                onSuggestions={onKeywordSuggestions}
              />
            ) : slug ? (
              <SubmissionKeywordSuggest
                slug={slug}
                canSuggest={canSuggestKeywords}
                suggestedEn={suggestedKeywordsEn}
                suggestedAr={suggestedKeywordsAr}
                onSuggestions={onKeywordSuggestions}
              />
            ) : null}
            <div
              className="flex flex-col gap-1 text-sm"
              data-field-error="keywords"
            >
              <span
                id="submission-keywords-en-label"
                className="font-medium text-ink"
              >
                {t('keywordsLabelEn')}
              </span>
              <div dir="ltr" lang="en">
                <KeywordTagsInput
                  tags={keywordTags}
                  onChange={(tags) => {
                    setKeywordTags(tags);
                    clearFormErr('keywords');
                  }}
                  inputValue={keywordDraft}
                  onInputChange={setKeywordDraft}
                  placeholder={t('keywordsPlaceholder')}
                  id="submission-keywords-en"
                  aria-labelledby="submission-keywords-en-label"
                  aria-describedby="submission-keywords-en-hint"
                  invalid={hasErr('keywords')}
                />
              </div>
              <span
                id="submission-keywords-en-hint"
                className="text-xs text-ink/55"
              >
                {t('keywordsCount', { count: keywordTags.length })}
              </span>
              <KeywordSuggestionChips
                suggestions={suggestedKeywordsEn}
                onAdd={addEnKeyword}
                onAddAll={addAllEnKeywords}
                addLabel={t('keywordSuggestAdd')}
                addAllLabel={t('keywordSuggestAddAll')}
                dir="ltr"
                lang="en"
              />
            </div>
            <div
              className="flex flex-col gap-1 text-sm"
              data-field-error="keywordsAr"
            >
              <span
                id="submission-keywords-ar-label"
                className="font-medium text-ink"
              >
                {t('keywordsLabelAr')}
              </span>
              <div dir="rtl" lang="ar">
                <KeywordTagsInput
                  tags={keywordTagsAr}
                  onChange={(tags) => {
                    setKeywordTagsAr(tags);
                    clearFormErr('keywordsAr');
                  }}
                  inputValue={keywordDraftAr}
                  onInputChange={setKeywordDraftAr}
                  placeholder={t('keywordsPlaceholderAr')}
                  id="submission-keywords-ar"
                  aria-labelledby="submission-keywords-ar-label"
                  aria-describedby="submission-keywords-ar-hint"
                  invalid={hasErr('keywordsAr')}
                />
              </div>
              <span
                id="submission-keywords-ar-hint"
                className="text-xs text-ink/55"
              >
                {t('keywordsCount', { count: keywordTagsAr.length })}
              </span>
              <KeywordSuggestionChips
                suggestions={suggestedKeywordsAr}
                onAdd={addArKeyword}
                onAddAll={addAllArKeywords}
                addLabel={t('keywordSuggestAdd')}
                addAllLabel={t('keywordSuggestAddAll')}
                dir="rtl"
                lang="ar"
              />
            </div>
          </div>
        </div>
      ) : null}

      {showAuthorsSection ? (
        <div>
          {!wizardStep ? (
            <>
              <h3 className="font-serif text-lg font-semibold text-ink">
                {t('sectionAuthors')}
              </h3>
              <p className="mt-1 text-sm text-ink/65">
                {t('sectionAuthorsHint')}
              </p>
            </>
          ) : null}
          <ul className="mt-4 space-y-4">
            {fields.map((field, idx) => {
              const c = contributors[idx];
              if (!c) return null;
              return (
                <li
                  key={field.id}
                  data-field-error={contributorFieldKey(idx, 'fullName')}
                  className={`rounded-lg border bg-paper/40 p-4 ${
                    hasErr(contributorFieldKey(idx, 'fullName')) ||
                    hasErr(contributorFieldKey(idx, 'affiliation')) ||
                    hasErr('corresponding') ||
                    hasErr('contributors')
                      ? 'border-red-400 ring-1 ring-red-500/15'
                      : 'border-ink/12'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
                      {t('authorN', { n: idx + 1 })}
                    </span>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="corresponding"
                        checked={c.isCorresponding}
                        onChange={() => setCorresponding(idx)}
                        className="size-4 text-accent"
                      />
                      {t('correspondingAuthor')}
                    </label>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                      <span>{t('authorFullName')}</span>
                      <Input
                        {...register(`contributors.${idx}.fullName`, {
                          onChange: () => {
                            clearFormErr(contributorFieldKey(idx, 'fullName'));
                            clearFormErr('contributors');
                          },
                        })}
                        error={hasErr(contributorFieldKey(idx, 'fullName'))}
                        aria-invalid={hasErr(
                          contributorFieldKey(idx, 'fullName'),
                        )}
                        className={fieldInputCls(
                          hasErr(contributorFieldKey(idx, 'fullName')),
                          inputVariant,
                        )}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span>{t('authorEmail')}</span>
                      <Input
                        type="email"
                        {...register(`contributors.${idx}.email`)}
                        className={fieldInputCls(false, inputVariant)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                      <span>{t('authorAffiliation')}</span>
                      <Input
                        {...register(`contributors.${idx}.affiliation`, {
                          onChange: () => {
                            clearFormErr(
                              contributorFieldKey(idx, 'affiliation'),
                            );
                            clearFormErr('contributors');
                          },
                        })}
                        placeholder={t('authorAffiliationPlaceholder')}
                        error={hasErr(contributorFieldKey(idx, 'affiliation'))}
                        aria-invalid={hasErr(
                          contributorFieldKey(idx, 'affiliation'),
                        )}
                        className={fieldInputCls(
                          hasErr(contributorFieldKey(idx, 'affiliation')),
                          inputVariant,
                          'placeholder:text-ink/35',
                        )}
                      />
                    </label>
                  </div>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="danger-soft"
                      size="sm"
                      onClick={() => removeContributor(idx)}
                      className="mt-3"
                    >
                      {t('removeAuthor')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addContributor}
            className="mt-3 px-0 text-accent hover:text-accent/85"
          >
            {t('addAuthor')}
          </Button>
        </div>
      ) : null}

      {showDeclarationsSection ? (
        <>
          <div>
            {!wizardStep ? (
              <h3 className="font-serif text-lg font-semibold text-ink">
                {t('sectionFunding')}
              </h3>
            ) : null}
            <label
              className={`flex flex-col gap-1 text-sm ${wizardStep ? '' : 'mt-3'}`}
            >
              <span className="text-ink/80">{t('fundingStatement')}</span>
              <textarea
                {...register('fundingStatement')}
                rows={3}
                placeholder={t('fundingPlaceholder')}
                className={
                  wizardStep
                    ? fieldInputCls(
                        false,
                        inputVariant,
                        'placeholder:text-ink/35',
                      )
                    : 'rounded-md border border-ink/15 bg-surface px-3 py-2 outline-none placeholder:text-ink/35 focus:border-accent'
                }
              />
            </label>
          </div>

          <div>
            {!wizardStep ? (
              <>
                <h3 className="font-serif text-lg font-semibold text-ink">
                  {t('sectionDeclarations')}
                </h3>
                <p className="mt-1 text-sm text-ink/65">
                  {t('sectionDeclarationsHint')}
                </p>
              </>
            ) : null}
            <div className={`flex flex-col gap-4 ${wizardStep ? '' : 'mt-4'}`}>
              <label
                className="flex flex-col gap-1 text-sm"
                data-field-error="coi"
              >
                <span className="font-medium">{t('conflictOfInterest')}</span>
                <textarea
                  {...register('conflictOfInterestStatement', {
                    onChange: () => clearFormErr('coi'),
                  })}
                  rows={2}
                  placeholder={t('coiPlaceholder')}
                  aria-invalid={hasErr('coi')}
                  className={fieldInputCls(
                    hasErr('coi'),
                    inputVariant,
                    'placeholder:text-ink/35',
                  )}
                />
              </label>
              <label
                className="flex flex-col gap-1 text-sm"
                data-field-error="ethics"
              >
                <span className="font-medium">{t('ethicalApproval')}</span>
                <Input
                  {...register('ethicalApprovalReference', {
                    onChange: () => clearFormErr('ethics'),
                  })}
                  placeholder={t('ethicalPlaceholder')}
                  error={hasErr('ethics')}
                  aria-invalid={hasErr('ethics')}
                  className={fieldInputCls(
                    hasErr('ethics'),
                    inputVariant,
                    'placeholder:text-ink/35',
                  )}
                />
              </label>
              <label
                className="flex flex-col gap-1 text-sm"
                data-field-error="aiUsage"
              >
                <span className="font-medium">{t('aiUsage')}</span>
                <textarea
                  {...register('aiUsageStatement', {
                    onChange: () => clearFormErr('aiUsage'),
                  })}
                  rows={2}
                  placeholder={t('aiPlaceholder')}
                  aria-invalid={hasErr('aiUsage')}
                  className={fieldInputCls(
                    hasErr('aiUsage'),
                    inputVariant,
                    'placeholder:text-ink/35',
                  )}
                />
              </label>
              <div data-field-error="originality">
                <Controller
                  name="originalityConfirmed"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id="submission-originality-confirmed"
                      label={t('originalityConfirm')}
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        clearFormErr('originality');
                      }}
                      className={`${
                        hasErr('originality')
                          ? 'border-red-400 ring-1 ring-red-500/15'
                          : 'border-transparent'
                      } bg-transparent p-2 hover:bg-ink/[0.02]`}
                    />
                  )}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}

      {!isCreate && slug && onDisciplineUpdated && (
        <SubmissionDisciplinePanel
          slug={slug}
          mode="author"
          canEdit
          fields={{
            disciplines: initial.disciplines ?? [],
            disciplineSource: initial.disciplineSource ?? null,
            disciplineSuggestedLabels: initial.disciplineSuggestedLabels ?? [],
            disciplineSuggestedConfidence:
              initial.disciplineSuggestedConfidence ?? null,
            disciplineScopeInJournal: initial.disciplineScopeInJournal ?? null,
            disciplineScopeWarning: initial.disciplineScopeWarning ?? null,
          }}
          onUpdated={onDisciplineUpdated}
        />
      )}

      {!hideSaveButton ? (
        <Button
          type="button"
          loading={isSubmitting}
          disabled={isSubmitting}
          onClick={() => void save()}
          className="min-w-[7rem] rounded-md bg-ink text-paper hover:bg-ink/90"
        >
          {saveLabelOverride ?? t('saveMetadata')}
        </Button>
      ) : null}
    </div>
  );
});

export type MetadataDisplayInitial = MetadataDisplayInitialBase &
  SubmissionDisciplineFields;

type MetadataDisplayInitialBase = {
  articleType: string | null;
  keywords: string | null;
  keywordsAr: string | null;
  contributors: ContributorRow[] | null;
  fundingStatement: string | null;
  conflictOfInterestStatement: string | null;
  ethicalApprovalReference: string | null;
  originalityConfirmed: boolean;
  aiUsageStatement: string | null;
};

export function SubmissionMetadataDisplay({
  initial,
}: {
  initial: MetadataDisplayInitial;
}) {
  return <MetadataReadonly initial={initial} />;
}

function MetadataReadonly({ initial }: { initial: MetadataDisplayInitial }) {
  const t = useTranslations('SubmissionWorkflow');
  const tKey = t as unknown as (k: string) => string;
  const typeLabel =
    initial.articleType &&
    (SUBMISSION_ARTICLE_TYPES as readonly string[]).includes(
      initial.articleType,
    )
      ? tKey(`articleType_${initial.articleType}`)
      : initial.articleType;
  const disciplineFields: SubmissionDisciplineFields = {
    disciplines: initial.disciplines ?? [],
    disciplineSource: initial.disciplineSource ?? null,
    disciplineSuggestedLabels: initial.disciplineSuggestedLabels ?? [],
    disciplineSuggestedConfidence:
      initial.disciplineSuggestedConfidence ?? null,
    disciplineScopeInJournal: initial.disciplineScopeInJournal ?? null,
    disciplineScopeWarning: initial.disciplineScopeWarning ?? null,
  };

  return (
    <div className="space-y-4">
      {((disciplineFields.disciplineSuggestedLabels?.length ?? 0) > 0 ||
        (disciplineFields.disciplines?.length ?? 0) > 0) && (
        <div
          className="rounded-md border border-ink/10 bg-paper/40 px-3 py-2 text-sm"
          dir="auto"
        >
          {(disciplineFields.disciplineSuggestedLabels?.length ?? 0) > 0 && (
            <div className="text-ink/85">
              <p className="font-medium text-ink">
                {t('disciplineAiSuggestion')}
              </p>
              <DisciplineBadges
                labels={disciplineFields.disciplineSuggestedLabels ?? []}
                size="sm"
                className="mt-1"
              />
              {disciplineFields.disciplineSuggestedConfidence != null && (
                <p className="mt-1 text-ink/55">
                  ({disciplineFields.disciplineSuggestedConfidence.toFixed(1)}%)
                </p>
              )}
            </div>
          )}
          {(disciplineFields.disciplines?.length ?? 0) > 0 && (
            <div className="mt-2 text-ink/85">
              <p className="font-medium text-ink">{t('disciplineConfirmed')}</p>
              <DisciplineBadges
                labels={disciplineFields.disciplines ?? []}
                size="sm"
                className="mt-1"
              />
            </div>
          )}
          {disciplineFields.disciplineScopeWarning ===
            'suggested_out_of_journal_scope' && (
            <p className="mt-2 text-xs font-medium text-amber-900">
              {t('disciplineScopeWarning')}
            </p>
          )}
        </div>
      )}
      {initial.articleType && (
        <p>
          <span className="font-medium text-ink">{t('articleType')}: </span>
          <span className="text-ink/80">{typeLabel}</span>
        </p>
      )}
      {initial.keywords?.trim() && (
        <p
          dir="ltr"
          lang="en"
          className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-baseline"
        >
          <span className="shrink-0 font-medium text-ink">
            {t('keywordsLabelEn')}:{' '}
          </span>
          <KeywordTagsDisplay
            tags={parseKeywordsFromStorage(initial.keywords)}
          />
        </p>
      )}
      {initial.keywordsAr?.trim() && (
        <p
          dir="rtl"
          lang="ar"
          className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-baseline"
        >
          <span className="shrink-0 font-medium text-ink">
            {t('keywordsLabelAr')}:{' '}
          </span>
          <KeywordTagsDisplay
            tags={parseKeywordsFromStorage(initial.keywordsAr)}
          />
        </p>
      )}
      {initial.contributors && initial.contributors.length > 0 && (
        <div>
          <p className="font-medium text-ink">{t('sectionAuthors')}</p>
          <ul className="mt-2 list-inside list-disc text-ink/80">
            {initial.contributors.map((c, i) => (
              <li key={i}>
                {c.fullName}
                {c.isCorresponding ? ` (${t('correspondingAuthor')})` : ''}
                {' — '}
                {c.affiliation}
                {c.email?.trim() ? ` · ${c.email}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {initial.fundingStatement?.trim() && (
        <div>
          <p className="font-medium text-ink">{t('fundingStatement')}</p>
          <p className="mt-1 whitespace-pre-wrap text-ink/80">
            {initial.fundingStatement}
          </p>
        </div>
      )}
      <div className="space-y-2 border-t border-ink/10 pt-3">
        <p className="font-medium text-ink">{t('sectionDeclarations')}</p>
        {initial.conflictOfInterestStatement && (
          <p className="text-sm text-ink/80">
            <span className="font-medium">{t('conflictOfInterest')}: </span>
            {initial.conflictOfInterestStatement}
          </p>
        )}
        {initial.ethicalApprovalReference && (
          <p className="text-sm text-ink/80">
            <span className="font-medium">{t('ethicalApproval')}: </span>
            {initial.ethicalApprovalReference}
          </p>
        )}
        {initial.aiUsageStatement && (
          <p className="text-sm text-ink/80">
            <span className="font-medium">{t('aiUsage')}: </span>
            {initial.aiUsageStatement}
          </p>
        )}
        <p className="text-sm text-ink/80">
          {t('originalityConfirm')}:{' '}
          {initial.originalityConfirmed ? t('yes') : t('no')}
        </p>
      </div>
    </div>
  );
}
