export type PreSubmitGrammarNote = {
  excerpt: string;
  suggestion: string;
  rule: string;
};

export type PreSubmitAnalysisData = {
  id: string;
  analyzedAt: string;
  contentHash: string;
  formatIssues: string[];
  grammarNotes: PreSubmitGrammarNote[];
  referenceIssues: string[];
  aiUnavailable: boolean;
  acknowledged: boolean;
  acknowledgedAt: string | null;
};

/** Frontend alias — same shape as {@link PreSubmitAnalysisData}. */
export type PreSubmitAnalysis = PreSubmitAnalysisData;

export type PreSubmitSubmitState =
  | 'not_required'
  | 'not_run'
  | 'validating'
  | 'stale'
  | 'blocking'
  | 'ready';

export const PRE_SUBMIT_VALIDATION_FIELD = 'preSubmitValidation';

export const PRE_SUBMIT_API_ERROR_CODES = [
  'PRE_SUBMIT_ANALYSIS_REQUIRED',
  'PRE_SUBMIT_ANALYSIS_STALE',
  'PRE_SUBMIT_BLOCKING_ISSUES',
] as const;

export type PreSubmitApiErrorCode = (typeof PRE_SUBMIT_API_ERROR_CODES)[number];
