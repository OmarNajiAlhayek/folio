import type {
  PreSubmitAnalysis,
  PreSubmitSubmitState,
} from '../contracts/pre-submit-analysis';

export function requiresPreSubmitValidation(
  hasConstructorDraft: boolean,
  presentConstructor: boolean,
): boolean {
  return hasConstructorDraft && presentConstructor;
}

export function computePreSubmitSubmitState(input: {
  required: boolean;
  validating: boolean;
  busy: boolean;
  analysis: PreSubmitAnalysis | null | undefined;
  isStale: boolean;
}): PreSubmitSubmitState {
  const { required, validating, analysis, isStale } = input;
  if (!required) return 'not_required';
  if (validating) return 'validating';
  if (!analysis) return 'not_run';
  if (isStale) return 'stale';
  if (analysis.formatIssues.length > 0 || analysis.referenceIssues.length > 0) {
    return 'blocking';
  }
  return 'ready';
}

export function preSubmitSubmitDisabled(
  state: PreSubmitSubmitState,
  busy: boolean,
  hasManuscript: boolean,
): boolean {
  if (busy || !hasManuscript) return true;
  switch (state) {
    case 'not_required':
    case 'ready':
    case 'not_run':
      return false;
    default:
      return true;
  }
}
