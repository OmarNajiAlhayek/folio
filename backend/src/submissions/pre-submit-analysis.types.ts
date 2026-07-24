export type {
  PreSubmitAnalysisData,
  PreSubmitGrammarNote,
} from '@folio/shared/contracts/pre-submit-analysis';

export type ManuscriptAnalysisResult = {
  formatIssues: string[];
  grammarNotes: import('@folio/shared/contracts/pre-submit-analysis').PreSubmitGrammarNote[];
  referenceIssues: string[];
  aiUnavailable: boolean;
};
