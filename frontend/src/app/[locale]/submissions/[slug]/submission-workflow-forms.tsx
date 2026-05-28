"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiJson, apiUpload } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";
import { SimpleSelect } from "@/components/ui/select";
import {
  KeywordTagsDisplay,
  KeywordTagsInput,
} from "@/components/ui/keyword-tags-input";
import { Spinner } from "@/components/ui/spinner";
import {
  parseKeywordsFromStorage,
  serializeKeywords,
} from "@/lib/keywords";
import {
  addAllSuggestedKeywords,
  addSuggestedKeyword,
  KeywordSuggestionChips,
  notifyKeywordAddFailure,
  SubmissionKeywordSuggest,
  type KeywordSuggestionResult,
} from "@/components/submission-keyword-suggest";
import {
  ABSTRACT_MAX_WORDS,
  countWords,
  createSubmissionSchema,
  formatZodIssues,
  joinValidationBulletList,
  safeParseResult,
  submissionMetadataPatchSchema,
  SUBMISSION_ARTICLE_TYPES,
} from "@/lib/validation";
import { SubmissionDisciplinePanel } from "@/components/submission-discipline-panel";
import type { SubmissionDisciplineFields } from "@/lib/discipline-labels";

export type ContributorRow = {
  fullName: string;
  email?: string;
  affiliation: string;
  sortOrder: number;
  isCorresponding: boolean;
};

export type SubmissionMetadataFormInitial = {
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
  discipline?: string | null;
  disciplineSource?: string | null;
  disciplineSuggested?: string | null;
  disciplineSuggestedConfidence?: number | null;
  disciplineScopeInJournal?: boolean | null;
  disciplineScopeWarning?: string | null;
};

export const FILE_KIND_ORDER = [
  { kind: "cover_letter", required: true },
  { kind: "title_page", required: true },
  { kind: "manuscript", required: true },
  { kind: "figure", required: false },
  { kind: "table", required: false },
  { kind: "supplementary", required: false },
] as const;

export type SubmissionFileKind = (typeof FILE_KIND_ORDER)[number]["kind"];

/** File upload rows for the submission detail page (all kinds, including manuscript). */
export function fileKindsForSubmissionDetail(_isConstructor?: boolean) {
  return [...FILE_KIND_ORDER];
}

type SubmissionMetadataFormProps =
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
    };

export function SubmissionMetadataForm(props: SubmissionMetadataFormProps) {
  const isCreate = props.createMode === true;
  const slug = !isCreate ? props.slug : "";
  const canEdit = isCreate ? true : props.canEdit;
  const initial = props.initial;
  const onError = props.onError;
  const saveLabelOverride = props.saveButtonLabel;
  const onSavedNext =
    "onSaved" in props && props.onSaved ? props.onSaved : undefined;
  const onCreatedNext =
    "onCreated" in props && props.onCreated ? props.onCreated : undefined;
  const getStagedFiles =
    isCreate && "getStagedFiles" in props ? props.getStagedFiles : undefined;
  const clearStagedFiles =
    isCreate && "clearStagedFiles" in props ? props.clearStagedFiles : undefined;
  const onSavingChange =
    isCreate && "onSavingChange" in props ? props.onSavingChange : undefined;
  const onDisciplineUpdated =
    !isCreate && "onDisciplineUpdated" in props
      ? props.onDisciplineUpdated
      : undefined;

  const t = useTranslations("SubmissionWorkflow");
  const tv = useTranslations("Validation");
  const tDetail = useTranslations("SubmissionDetail");
  const { resolve: resolveApiError } = useApiErrorMessages();
  const [title, setTitle] = useState(initial.title);
  const [titleAr, setTitleAr] = useState(initial.titleAr);
  const [abstract, setAbstract] = useState(initial.abstract);
  const [abstractAr, setAbstractAr] = useState(initial.abstractAr);
  const [articleType, setArticleType] = useState(initial.articleType ?? "");
  const [keywordTags, setKeywordTags] = useState<string[]>(() =>
    parseKeywordsFromStorage(initial.keywords),
  );
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordTagsAr, setKeywordTagsAr] = useState<string[]>(() =>
    parseKeywordsFromStorage(initial.keywordsAr),
  );
  const [keywordDraftAr, setKeywordDraftAr] = useState("");
  const [suggestedKeywordsEn, setSuggestedKeywordsEn] = useState<string[]>([]);
  const [suggestedKeywordsAr, setSuggestedKeywordsAr] = useState<string[]>([]);
  const [contributors, setContributors] = useState<ContributorRow[]>(() =>
    initial.contributors?.length
      ? initial.contributors.map((c, i) => ({
          fullName: c.fullName,
          email: c.email ?? "",
          affiliation: c.affiliation,
          sortOrder: c.sortOrder ?? i,
          isCorresponding: c.isCorresponding,
        }))
      : [
          {
            fullName: "",
            email: "",
            affiliation: "",
            sortOrder: 0,
            isCorresponding: true,
          },
        ],
  );
  const [fundingStatement, setFundingStatement] = useState(
    initial.fundingStatement ?? "",
  );
  const [coi, setCoi] = useState(initial.conflictOfInterestStatement ?? "");
  const [ethics, setEthics] = useState(initial.ethicalApprovalReference ?? "");
  const [originality, setOriginality] = useState(initial.originalityConfirmed);
  const [aiUsage, setAiUsage] = useState(initial.aiUsageStatement ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  const initialContributorsKey = JSON.stringify(initial.contributors ?? []);

  useEffect(() => {
    setTitle(initial.title);
    setTitleAr(initial.titleAr);
    setAbstract(initial.abstract);
    setAbstractAr(initial.abstractAr);
    setArticleType(initial.articleType ?? "");
    setKeywordTags(parseKeywordsFromStorage(initial.keywords));
    setKeywordDraft("");
    setKeywordTagsAr(parseKeywordsFromStorage(initial.keywordsAr));
    setKeywordDraftAr("");
    setContributors(
      initial.contributors?.length
        ? initial.contributors.map((c, i) => ({
            fullName: c.fullName,
            email: c.email ?? "",
            affiliation: c.affiliation,
            sortOrder: c.sortOrder ?? i,
            isCorresponding: c.isCorresponding,
          }))
        : [
            {
              fullName: "",
              email: "",
              affiliation: "",
              sortOrder: 0,
              isCorresponding: true,
            },
          ],
    );
    setFundingStatement(initial.fundingStatement ?? "");
    setCoi(initial.conflictOfInterestStatement ?? "");
    setEthics(initial.ethicalApprovalReference ?? "");
    setOriginality(initial.originalityConfirmed);
    setAiUsage(initial.aiUsageStatement ?? "");
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
  ]);

  const save = useCallback(async () => {
    setSaving(true);
    onError("");
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

      const metadataSchema = isCreate
        ? createSubmissionSchema
        : submissionMetadataPatchSchema;
      const parsed = safeParseResult(metadataSchema, body);
      if (!parsed.ok) {
        onError(
          joinValidationBulletList(formatZodIssues(tv, parsed.error.issues)),
        );
        return;
      }

      if (isCreate) {
        const created = await apiJson<{ id: string; slug: string }>(
          "/submissions",
          {
            method: "POST",
            body: JSON.stringify(parsed.data),
          },
        );
        const createdSlug = created.slug;
        const staged = getStagedFiles?.() ?? {};
        let uploadErr: string | null = null;
        // If an upload fails, still navigate so the author can finish on the detail page.
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
              uploadErr = resolveApiError(e, tDetail("uploadFailed"));
            }
          }
        }
        toast.success(t("draftCreated"), { id: "submission-metadata-draft-created" });
        if (uploadErr) onError(uploadErr);
        clearStagedFiles?.();
        onCreatedNext?.(createdSlug);
      } else {
        await apiJson(`/submissions/${encodeURIComponent(slug)}`, {
          method: "PATCH",
          body: JSON.stringify(parsed.data),
        });
        toast.success(t("saveSuccess"), { id: "submission-metadata-save-success" });
        onSavedNext?.();
      }
    } catch (e) {
      onError(resolveApiError(e, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }, [
    isCreate,
    slug,
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
    onError,
    onSavedNext,
    onCreatedNext,
    getStagedFiles,
    clearStagedFiles,
    t,
    tDetail,
    tv,
    resolveApiError,
  ]);

  function setCorresponding(idx: number) {
    setContributors((rows) =>
      rows.map((r, i) => ({ ...r, isCorresponding: i === idx })),
    );
  }

  function addContributor() {
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
  }

  function removeContributor(idx: number) {
    setContributors((rows) => {
      const next = rows.filter((_, i) => i !== idx);
      if (!next.some((r) => r.isCorresponding) && next.length > 0) {
        next[0] = { ...next[0], isCorresponding: true };
      }
      return next.map((r, i) => ({ ...r, sortOrder: i }));
    });
  }

  const canSuggestKeywords =
    Boolean(title.trim() && abstract.trim()) ||
    Boolean(titleAr.trim() && abstractAr.trim());

  const onKeywordSuggestions = useCallback((result: KeywordSuggestionResult) => {
    setSuggestedKeywordsEn(result.keywordsEn);
    setSuggestedKeywordsAr(result.keywordsAr);
  }, []);

  const keywordAddMessages = useMemo(
    () => ({
      max: t("keywordSuggestMax"),
      duplicate: t("keywordSuggestDuplicate"),
      tooLong: t("keywordSuggestTooLong"),
      addAllNone: t("keywordSuggestAddAllNone"),
    }),
    [t],
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

  if (!canEdit) {
    return <SubmissionMetadataDisplay initial={initial} />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-serif text-lg font-semibold text-ink">
          {t("sectionMetadata")}
        </h3>
        <p className="mt-1 text-sm text-ink/65">{t("sectionMetadataHint")}</p>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">{t("articleType")}</span>
            <SimpleSelect
              value={articleType}
              onValueChange={setArticleType}
              placeholder={t("articleTypePlaceholder")}
              options={SUBMISSION_ARTICLE_TYPES.map((v) => ({
                value: v,
                label: t(`articleType_${v}`),
              }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">{t("titleLabelEn")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              dir="ltr"
              className="rounded-md border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">{t("titleLabelAr")}</span>
            <input
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              dir="rtl"
              className="rounded-md border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">{t("abstractLabelEn")}</span>
            <textarea
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              rows={6}
              dir="ltr"
              className="rounded-md border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
            <span className="text-xs text-ink/55">
              {t("abstractWordCount", {
                count: countWords(abstract),
                max: ABSTRACT_MAX_WORDS,
              })}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">{t("abstractLabelAr")}</span>
            <textarea
              value={abstractAr}
              onChange={(e) => setAbstractAr(e.target.value)}
              rows={6}
              dir="rtl"
              className="rounded-md border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
            />
            <span className="text-xs text-ink/55">
              {t("abstractWordCount", {
                count: countWords(abstractAr),
                max: ABSTRACT_MAX_WORDS,
              })}
            </span>
          </label>
          {!isCreate && slug ? (
            <SubmissionKeywordSuggest
              slug={slug}
              canSuggest={canSuggestKeywords}
              suggestedEn={suggestedKeywordsEn}
              suggestedAr={suggestedKeywordsAr}
              onSuggestions={onKeywordSuggestions}
            />
          ) : null}
          <div className="flex flex-col gap-1 text-sm">
            <span
              id="submission-keywords-en-label"
              className="font-medium text-ink"
            >
              {t("keywordsLabelEn")}
            </span>
            <div dir="ltr" lang="en">
              <KeywordTagsInput
                tags={keywordTags}
                onChange={setKeywordTags}
                inputValue={keywordDraft}
                onInputChange={setKeywordDraft}
                placeholder={t("keywordsPlaceholder")}
                id="submission-keywords-en"
                aria-labelledby="submission-keywords-en-label"
                aria-describedby="submission-keywords-en-hint"
              />
            </div>
            <span
              id="submission-keywords-en-hint"
              className="text-xs text-ink/55"
            >
              {t("keywordsCount", { count: keywordTags.length })}
            </span>
            <KeywordSuggestionChips
              suggestions={suggestedKeywordsEn}
              onAdd={addEnKeyword}
              onAddAll={addAllEnKeywords}
              addLabel={t("keywordSuggestAdd")}
              addAllLabel={t("keywordSuggestAddAll")}
              dir="ltr"
              lang="en"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span
              id="submission-keywords-ar-label"
              className="font-medium text-ink"
            >
              {t("keywordsLabelAr")}
            </span>
            <div dir="rtl" lang="ar">
              <KeywordTagsInput
                tags={keywordTagsAr}
                onChange={setKeywordTagsAr}
                inputValue={keywordDraftAr}
                onInputChange={setKeywordDraftAr}
                placeholder={t("keywordsPlaceholderAr")}
                id="submission-keywords-ar"
                aria-labelledby="submission-keywords-ar-label"
                aria-describedby="submission-keywords-ar-hint"
              />
            </div>
            <span
              id="submission-keywords-ar-hint"
              className="text-xs text-ink/55"
            >
              {t("keywordsCount", { count: keywordTagsAr.length })}
            </span>
            <KeywordSuggestionChips
              suggestions={suggestedKeywordsAr}
              onAdd={addArKeyword}
              onAddAll={addAllArKeywords}
              addLabel={t("keywordSuggestAdd")}
              addAllLabel={t("keywordSuggestAddAll")}
              dir="rtl"
              lang="ar"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-serif text-lg font-semibold text-ink">
          {t("sectionAuthors")}
        </h3>
        <p className="mt-1 text-sm text-ink/65">{t("sectionAuthorsHint")}</p>
        <ul className="mt-4 space-y-4">
          {contributors.map((c, idx) => (
            <li
              key={idx}
              className="rounded-lg border border-ink/12 bg-paper/40 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
                  {t("authorN", { n: idx + 1 })}
                </span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="corresponding"
                    checked={c.isCorresponding}
                    onChange={() => setCorresponding(idx)}
                    className="size-4 text-accent"
                  />
                  {t("correspondingAuthor")}
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span>{t("authorFullName")}</span>
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
                    className="rounded-md border border-ink/15 bg-surface px-3 py-2 outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>{t("authorEmail")}</span>
                  <input
                    type="email"
                    value={c.email}
                    onChange={(e) => {
                      const v = e.target.value;
                      setContributors((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, email: v } : r)),
                      );
                    }}
                    className="rounded-md border border-ink/15 bg-surface px-3 py-2 outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span>{t("authorAffiliation")}</span>
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
                    placeholder={t("authorAffiliationPlaceholder")}
                    className="rounded-md border border-ink/15 bg-surface px-3 py-2 outline-none placeholder:text-ink/35 focus:border-accent"
                  />
                </label>
              </div>
              {contributors.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeContributor(idx)}
                  className="mt-3 text-sm text-red-700 hover:underline"
                >
                  {t("removeAuthor")}
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addContributor}
          className="mt-3 text-sm font-medium text-accent hover:underline"
        >
          {t("addAuthor")}
        </button>
      </div>

      <div>
        <h3 className="font-serif text-lg font-semibold text-ink">
          {t("sectionFunding")}
        </h3>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-ink/80">{t("fundingStatement")}</span>
          <textarea
            value={fundingStatement}
            onChange={(e) => setFundingStatement(e.target.value)}
            rows={3}
            placeholder={t("fundingPlaceholder")}
            className="rounded-md border border-ink/15 bg-surface px-3 py-2 outline-none placeholder:text-ink/35 focus:border-accent"
          />
        </label>
      </div>

      <div>
        <h3 className="font-serif text-lg font-semibold text-ink">
          {t("sectionDeclarations")}
        </h3>
        <p className="mt-1 text-sm text-ink/65">{t("sectionDeclarationsHint")}</p>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("conflictOfInterest")}</span>
            <textarea
              value={coi}
              onChange={(e) => setCoi(e.target.value)}
              rows={2}
              placeholder={t("coiPlaceholder")}
              className="rounded-md border border-ink/15 bg-surface px-3 py-2 outline-none placeholder:text-ink/35 focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("ethicalApproval")}</span>
            <input
              value={ethics}
              onChange={(e) => setEthics(e.target.value)}
              placeholder={t("ethicalPlaceholder")}
              className="rounded-md border border-ink/15 bg-surface px-3 py-2 outline-none placeholder:text-ink/35 focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("aiUsage")}</span>
            <textarea
              value={aiUsage}
              onChange={(e) => setAiUsage(e.target.value)}
              rows={2}
              placeholder={t("aiPlaceholder")}
              className="rounded-md border border-ink/15 bg-surface px-3 py-2 outline-none placeholder:text-ink/35 focus:border-accent"
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={originality}
              onChange={(e) => setOriginality(e.target.checked)}
              className="mt-1 size-4 rounded border-ink/25 text-accent"
            />
            <span>{t("originalityConfirm")}</span>
          </label>
        </div>
      </div>

      {!isCreate && slug && onDisciplineUpdated && (
        <SubmissionDisciplinePanel
          slug={slug}
          mode="author"
          canEdit
          fields={{
            discipline: initial.discipline ?? null,
            disciplineSource: initial.disciplineSource ?? null,
            disciplineSuggested: initial.disciplineSuggested ?? null,
            disciplineSuggestedConfidence:
              initial.disciplineSuggestedConfidence ?? null,
            disciplineScopeInJournal: initial.disciplineScopeInJournal ?? null,
            disciplineScopeWarning: initial.disciplineScopeWarning ?? null,
          }}
          onUpdated={onDisciplineUpdated}
        />
      )}

      <button
        type="button"
        disabled={saving}
        aria-busy={saving}
        aria-label={saving ? t("saving") : undefined}
        onClick={() => void save()}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-60"
      >
        {saving ? <Spinner size="sm" className="border-ink/30 border-t-paper" /> : (saveLabelOverride ?? t("saveMetadata"))}
      </button>
    </div>
  );
}

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
  const t = useTranslations("SubmissionWorkflow");
  const tKey = t as unknown as (k: string) => string;
  const typeLabel =
    initial.articleType &&
    (SUBMISSION_ARTICLE_TYPES as readonly string[]).includes(
      initial.articleType,
    )
      ? tKey(`articleType_${initial.articleType}`)
      : initial.articleType;
  const disciplineFields: SubmissionDisciplineFields = {
    discipline: initial.discipline ?? null,
    disciplineSource: initial.disciplineSource ?? null,
    disciplineSuggested: initial.disciplineSuggested ?? null,
    disciplineSuggestedConfidence: initial.disciplineSuggestedConfidence ?? null,
    disciplineScopeInJournal: initial.disciplineScopeInJournal ?? null,
    disciplineScopeWarning: initial.disciplineScopeWarning ?? null,
  };

  return (
    <div className="space-y-4">
      {(disciplineFields.disciplineSuggested || disciplineFields.discipline) && (
        <div className="rounded-md border border-ink/10 bg-paper/40 px-3 py-2 text-sm" dir="auto">
          {disciplineFields.disciplineSuggested && (
            <p className="text-ink/85">
              <span className="font-medium text-ink">{t("disciplineAiSuggestion")}: </span>
              {disciplineFields.disciplineSuggested}
              {disciplineFields.disciplineSuggestedConfidence != null && (
                <span className="ms-1 text-ink/55">
                  ({disciplineFields.disciplineSuggestedConfidence.toFixed(1)}%)
                </span>
              )}
            </p>
          )}
          {disciplineFields.discipline && (
            <p className="mt-1 text-ink/85">
              <span className="font-medium text-ink">{t("disciplineConfirmed")}: </span>
              {disciplineFields.discipline}
            </p>
          )}
          {disciplineFields.disciplineScopeWarning === "suggested_out_of_journal_scope" && (
            <p className="mt-2 text-xs font-medium text-amber-900">
              {t("disciplineScopeWarning")}
            </p>
          )}
        </div>
      )}
      {initial.articleType && (
        <p>
          <span className="font-medium text-ink">{t("articleType")}: </span>
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
            {t("keywordsLabelEn")}:{" "}
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
            {t("keywordsLabelAr")}:{" "}
          </span>
          <KeywordTagsDisplay
            tags={parseKeywordsFromStorage(initial.keywordsAr)}
          />
        </p>
      )}
      {initial.contributors && initial.contributors.length > 0 && (
        <div>
          <p className="font-medium text-ink">{t("sectionAuthors")}</p>
          <ul className="mt-2 list-inside list-disc text-ink/80">
            {initial.contributors.map((c, i) => (
              <li key={i}>
                {c.fullName}
                {c.isCorresponding ? ` (${t("correspondingAuthor")})` : ""}
                {" — "}
                {c.affiliation}
                {c.email?.trim() ? ` · ${c.email}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {initial.fundingStatement?.trim() && (
        <div>
          <p className="font-medium text-ink">{t("fundingStatement")}</p>
          <p className="mt-1 whitespace-pre-wrap text-ink/80">
            {initial.fundingStatement}
          </p>
        </div>
      )}
      <div className="space-y-2 border-t border-ink/10 pt-3">
        <p className="font-medium text-ink">{t("sectionDeclarations")}</p>
        {initial.conflictOfInterestStatement && (
          <p className="text-sm text-ink/80">
            <span className="font-medium">{t("conflictOfInterest")}: </span>
            {initial.conflictOfInterestStatement}
          </p>
        )}
        {initial.ethicalApprovalReference && (
          <p className="text-sm text-ink/80">
            <span className="font-medium">{t("ethicalApproval")}: </span>
            {initial.ethicalApprovalReference}
          </p>
        )}
        {initial.aiUsageStatement && (
          <p className="text-sm text-ink/80">
            <span className="font-medium">{t("aiUsage")}: </span>
            {initial.aiUsageStatement}
          </p>
        )}
        <p className="text-sm text-ink/80">
          {t("originalityConfirm")}: {initial.originalityConfirmed ? t("yes") : t("no")}
        </p>
      </div>
    </div>
  );
}
