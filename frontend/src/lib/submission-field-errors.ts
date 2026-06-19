import { parseKeywordsFromStorage } from '@/lib/keywords';
import {
  presentationIsValid,
  type ReviewManuscriptPresentation,
} from '@/lib/review-manuscript-presentation';
import type { SubmissionApiErrorCode } from '@/lib/submission-api-error-codes';
import { ABSTRACT_MAX_WORDS, countWords } from '@/lib/validation';

export type FieldInputVariant = 'wizard' | 'form';

const WIZARD_BASE =
  'w-full rounded-xl border bg-paper/60 text-ink outline-none transition-all duration-200';
const FORM_BASE =
  'rounded-md border bg-surface text-ink outline-none focus:border-accent';

export function fieldInputCls(
  invalid: boolean,
  variant: FieldInputVariant,
  extra = '',
) {
  const base = variant === 'wizard' ? WIZARD_BASE : FORM_BASE;
  const ok =
    variant === 'wizard'
      ? 'border-ink/15 dark:border-white/15 focus:border-accent focus:ring-2 focus:ring-accent/25 hover:border-ink/25 px-4 py-3'
      : 'border-ink/15 px-3 py-2';
  const err =
    variant === 'wizard'
      ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-500/15 dark:border-red-400'
      : 'border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-500/15';
  return [base, invalid ? err : ok, extra].filter(Boolean).join(' ');
}

export function fileFieldKey(kind: string): string {
  return `files.${kind}`;
}

export function contributorFieldKey(
  index: number,
  field: 'fullName' | 'affiliation' | 'email',
): string {
  return `contributors.${index}.${field}`;
}

export function hasFieldError(
  errors: Set<string> | undefined,
  key: string,
): boolean {
  return Boolean(errors?.has(key));
}

export function fileRowCls(
  invalid: boolean,
  base = 'rounded-xl border bg-paper/40 p-4 sm:p-5',
) {
  return `${base} ${invalid ? 'border-red-400 ring-1 ring-red-500/15' : 'border-ink/10 dark:border-white/10'}`;
}

/** Order used for the first toast message when multiple submit issues exist. */
export const SUBMIT_READINESS_CODE_ORDER: SubmissionApiErrorCode[] = [
  'SUBMISSION_MANUSCRIPT_PRESENTATION_REQUIRED',
  'SUBMISSION_INCOMPLETE_ARTICLE_TYPE',
  'SUBMISSION_INCOMPLETE_KEYWORDS',
  'SUBMISSION_INCOMPLETE_KEYWORDS_AR',
  'SUBMISSION_INCOMPLETE_TITLE_AR',
  'SUBMISSION_INCOMPLETE_ABSTRACT',
  'SUBMISSION_INCOMPLETE_ABSTRACT_AR',
  'SUBMISSION_ABSTRACT_TOO_LONG_EN',
  'SUBMISSION_ABSTRACT_TOO_LONG_AR',
  'SUBMISSION_INCOMPLETE_CONTRIBUTORS',
  'SUBMISSION_INCOMPLETE_CORRESPONDING',
  'SUBMISSION_INCOMPLETE_CONTRIBUTOR_FIELDS',
  'SUBMISSION_INCOMPLETE_ORIGINALITY',
  'SUBMISSION_INCOMPLETE_COI',
  'SUBMISSION_INCOMPLETE_ETHICS',
  'SUBMISSION_INCOMPLETE_AI',
  'SUBMISSION_INCOMPLETE_FILES',
];

export type SubmitReadinessContributor = {
  fullName?: string;
  affiliation?: string;
  email?: string;
  isCorresponding?: boolean;
};

export type SubmitReadinessSubmission = {
  articleType: string | null | undefined;
  titleAr?: string | null;
  abstract?: string | null;
  abstractAr?: string | null;
  keywords?: string | null;
  keywordsAr?: string | null;
  contributors?: SubmitReadinessContributor[] | null;
  originalityConfirmed?: boolean;
  conflictOfInterestStatement?: string | null;
  ethicalApprovalReference?: string | null;
  aiUsageStatement?: string | null;
};

export type SubmitReadinessInput = {
  submission: SubmitReadinessSubmission;
  files: Array<{ kind?: string }>;
  presentation: ReviewManuscriptPresentation;
  manuscriptSources: {
    hasUploadedManuscript: boolean;
    hasConstructorDraft: boolean;
  };
  codeMessages: Record<string, string>;
};

function missingFileKeys(
  presentation: ReviewManuscriptPresentation,
  fileKinds: Set<string>,
): string[] {
  const keys: string[] = [];
  if (presentation.presentUploaded) {
    for (const kind of ['cover_letter', 'title_page', 'manuscript'] as const) {
      if (!fileKinds.has(kind)) keys.push(fileFieldKey(kind));
    }
  }
  if (
    presentation.presentConstructor &&
    !fileKinds.has('manuscript_constructor')
  ) {
    keys.push(fileFieldKey('manuscript'));
  }
  return keys;
}

export function apiCodeToFieldErrors(
  code: string,
  ctx?: {
    presentation?: ReviewManuscriptPresentation;
    fileKinds?: Set<string>;
    contributors?: SubmitReadinessContributor[];
  },
): Set<string> {
  const errors = new Set<string>();
  switch (code) {
    case 'SUBMISSION_INCOMPLETE_ARTICLE_TYPE':
      errors.add('articleType');
      break;
    case 'SUBMISSION_INCOMPLETE_KEYWORDS':
      errors.add('keywords');
      break;
    case 'SUBMISSION_INCOMPLETE_KEYWORDS_AR':
      errors.add('keywordsAr');
      break;
    case 'SUBMISSION_INCOMPLETE_TITLE_AR':
      errors.add('titleAr');
      break;
    case 'SUBMISSION_INCOMPLETE_ABSTRACT':
      errors.add('abstract');
      break;
    case 'SUBMISSION_INCOMPLETE_ABSTRACT_AR':
      errors.add('abstractAr');
      break;
    case 'SUBMISSION_ABSTRACT_TOO_LONG_EN':
      errors.add('abstract');
      break;
    case 'SUBMISSION_ABSTRACT_TOO_LONG_AR':
      errors.add('abstractAr');
      break;
    case 'SUBMISSION_INCOMPLETE_CONTRIBUTORS':
      errors.add('contributors');
      break;
    case 'SUBMISSION_INCOMPLETE_CORRESPONDING':
      errors.add('corresponding');
      break;
    case 'SUBMISSION_INCOMPLETE_CONTRIBUTOR_FIELDS':
      if (ctx?.contributors?.length) {
        ctx.contributors.forEach((c, i) => {
          if (!c.fullName?.trim())
            errors.add(contributorFieldKey(i, 'fullName'));
          if (!c.affiliation?.trim()) {
            errors.add(contributorFieldKey(i, 'affiliation'));
          }
        });
      } else {
        errors.add('contributors');
      }
      break;
    case 'SUBMISSION_INCOMPLETE_ORIGINALITY':
      errors.add('originality');
      break;
    case 'SUBMISSION_INCOMPLETE_COI':
      errors.add('coi');
      break;
    case 'SUBMISSION_INCOMPLETE_ETHICS':
      errors.add('ethics');
      break;
    case 'SUBMISSION_INCOMPLETE_AI':
      errors.add('aiUsage');
      break;
    case 'SUBMISSION_INCOMPLETE_FILES':
      if (ctx?.presentation && ctx.fileKinds) {
        for (const k of missingFileKeys(ctx.presentation, ctx.fileKinds)) {
          errors.add(k);
        }
      } else {
        errors.add(fileFieldKey('cover_letter'));
        errors.add(fileFieldKey('title_page'));
        errors.add(fileFieldKey('manuscript'));
      }
      break;
    case 'SUBMISSION_MANUSCRIPT_PRESENTATION_REQUIRED':
      errors.add('presentation');
      break;
    default:
      break;
  }
  return errors;
}

export function collectSubmitReadinessErrors(input: SubmitReadinessInput): {
  errors: Set<string>;
  message: string | null;
  codes: SubmissionApiErrorCode[];
} {
  const { submission, files, presentation, manuscriptSources, codeMessages } =
    input;
  const codes: SubmissionApiErrorCode[] = [];
  const fileKinds = new Set(
    files.map((f) => f.kind).filter((k): k is string => Boolean(k)),
  );
  const contributors = submission.contributors ?? [];

  const push = (code: SubmissionApiErrorCode) => {
    if (!codes.includes(code)) codes.push(code);
  };

  if (!presentationIsValid(presentation, manuscriptSources)) {
    push('SUBMISSION_MANUSCRIPT_PRESENTATION_REQUIRED');
  }

  if (!submission.articleType) {
    push('SUBMISSION_INCOMPLETE_ARTICLE_TYPE');
  }

  const kw = parseKeywordsFromStorage(submission.keywords);
  if (kw.length < 3 || kw.length > 6) {
    push('SUBMISSION_INCOMPLETE_KEYWORDS');
  }

  const kwAr = parseKeywordsFromStorage(submission.keywordsAr);
  if (kwAr.length < 3 || kwAr.length > 6) {
    push('SUBMISSION_INCOMPLETE_KEYWORDS_AR');
  }

  if (!submission.titleAr?.trim()) {
    push('SUBMISSION_INCOMPLETE_TITLE_AR');
  }

  if (!submission.abstract?.trim()) {
    push('SUBMISSION_INCOMPLETE_ABSTRACT');
  }

  if (!submission.abstractAr?.trim()) {
    push('SUBMISSION_INCOMPLETE_ABSTRACT_AR');
  }

  const abstractEn = submission.abstract ?? '';
  const abstractArText = submission.abstractAr ?? '';
  if (countWords(abstractEn) > ABSTRACT_MAX_WORDS) {
    push('SUBMISSION_ABSTRACT_TOO_LONG_EN');
  }
  if (countWords(abstractArText) > ABSTRACT_MAX_WORDS) {
    push('SUBMISSION_ABSTRACT_TOO_LONG_AR');
  }

  if (!Array.isArray(contributors) || contributors.length < 1) {
    push('SUBMISSION_INCOMPLETE_CONTRIBUTORS');
  } else {
    const corr = contributors.filter((c) => c.isCorresponding);
    if (corr.length !== 1) {
      push('SUBMISSION_INCOMPLETE_CORRESPONDING');
    }
    for (const c of contributors) {
      if (!c.fullName?.trim() || !c.affiliation?.trim()) {
        push('SUBMISSION_INCOMPLETE_CONTRIBUTOR_FIELDS');
        break;
      }
    }
  }

  if (!submission.originalityConfirmed) {
    push('SUBMISSION_INCOMPLETE_ORIGINALITY');
  }

  if (!submission.conflictOfInterestStatement?.trim()) {
    push('SUBMISSION_INCOMPLETE_COI');
  }

  if (!submission.ethicalApprovalReference?.trim()) {
    push('SUBMISSION_INCOMPLETE_ETHICS');
  }

  if (!submission.aiUsageStatement?.trim()) {
    push('SUBMISSION_INCOMPLETE_AI');
  }

  if (missingFileKeys(presentation, fileKinds).length > 0) {
    push('SUBMISSION_INCOMPLETE_FILES');
  }

  const orderedCodes = SUBMIT_READINESS_CODE_ORDER.filter((c) =>
    codes.includes(c),
  );
  const errors = new Set<string>();
  const ctx = { presentation, fileKinds, contributors };
  for (const code of orderedCodes) {
    for (const key of apiCodeToFieldErrors(code, ctx)) {
      errors.add(key);
    }
  }

  const firstCode = orderedCodes[0];
  const message = firstCode ? (codeMessages[firstCode] ?? null) : null;

  return { errors, message, codes: orderedCodes };
}

/** Zod / RHF schema field names → UI `data-field-error` keys. */
export const METADATA_SCHEMA_TO_FIELD_ERROR_KEY: Record<string, string> = {
  conflictOfInterestStatement: 'coi',
  ethicalApprovalReference: 'ethics',
  aiUsageStatement: 'aiUsage',
};

/** UI field-error keys → react-hook-form field names. */
export const METADATA_UI_KEY_TO_FORM_FIELD: Record<string, string> = {
  coi: 'conflictOfInterestStatement',
  ethics: 'ethicalApprovalReference',
  aiUsage: 'aiUsageStatement',
  originality: 'originalityConfirmed',
};

export function metadataFormFieldForUiKey(key: string): string {
  return METADATA_UI_KEY_TO_FORM_FIELD[key] ?? key;
}

export function schemaFieldToUiErrorKey(path: string): string {
  const top = path.split('.')[0] ?? path;
  return METADATA_SCHEMA_TO_FIELD_ERROR_KEY[top] ?? path;
}

/** Map Zod top-level keys to submission field error keys. */
export function zodTopLevelToFieldErrors(
  by: Record<string, string>,
): Set<string> {
  const errors = new Set<string>();
  for (const key of Object.keys(by)) {
    if (key === '_root') continue;
    errors.add(schemaFieldToUiErrorKey(key));
  }
  return errors;
}

/** Flatten react-hook-form errors into UI field-error keys. */
export function rhfErrorsToFieldErrorSet(
  errors: Record<string, unknown>,
  prefix = '',
): Set<string> {
  const out = new Set<string>();
  for (const [key, val] of Object.entries(errors)) {
    if (!val) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && 'message' in val && val.message) {
      out.add(schemaFieldToUiErrorKey(path));
    } else if (typeof val === 'object') {
      for (const nested of rhfErrorsToFieldErrorSet(
        val as Record<string, unknown>,
        path,
      )) {
        out.add(nested);
      }
    }
  }
  return out;
}

export function rhfErrorsToBulletMessage(
  errors: Record<string, unknown>,
): string {
  const messages: string[] = [];
  const walk = (obj: Record<string, unknown>) => {
    for (const val of Object.values(obj)) {
      if (!val || typeof val !== 'object') continue;
      if ('message' in val && val.message) {
        messages.push(String(val.message));
      } else {
        walk(val as Record<string, unknown>);
      }
    }
  };
  walk(errors);
  if (messages.length === 0) return '';
  if (messages.length === 1) return messages[0]!;
  return messages.map((m) => `• ${m}`).join('\n');
}

/** Scroll order for draft submit — metadata before files. */
export const SUBMIT_FIELD_SCROLL_ORDER: string[] = [
  'articleType',
  'title',
  'titleAr',
  'abstract',
  'abstractAr',
  'keywords',
  'keywordsAr',
  'contributors',
  'corresponding',
  ...Array.from({ length: 20 }, (_, i) => [
    contributorFieldKey(i, 'fullName'),
    contributorFieldKey(i, 'affiliation'),
    contributorFieldKey(i, 'email'),
  ]).flat(),
  'coi',
  'ethics',
  'aiUsage',
  'originality',
  'presentation',
  fileFieldKey('cover_letter'),
  fileFieldKey('title_page'),
  fileFieldKey('manuscript'),
];

export function scrollToFirstFieldError(
  errors: Set<string>,
  orderedKeys: string[] = SUBMIT_FIELD_SCROLL_ORDER,
): void {
  if (typeof document === 'undefined') return;
  for (const key of orderedKeys) {
    if (!errors.has(key)) continue;
    const el = document.querySelector(`[data-field-error="${key}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
}
