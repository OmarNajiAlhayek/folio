import {
  computePreSubmitSubmitState,
  preSubmitSubmitDisabled,
  requiresPreSubmitValidation,
} from './pre-submit-validation';
import type { PreSubmitAnalysis } from '../contracts/pre-submit-analysis';

const cleanAnalysis: PreSubmitAnalysis = {
  id: 'a1',
  analyzedAt: '2026-01-01T00:00:00.000Z',
  contentHash: 'abc',
  formatIssues: [],
  grammarNotes: [],
  referenceIssues: [],
  aiUnavailable: false,
  acknowledged: true,
  acknowledgedAt: '2026-01-01T00:00:00.000Z',
};

describe('requiresPreSubmitValidation', () => {
  it('requires constructor draft presented for review', () => {
    expect(requiresPreSubmitValidation(true, true)).toBe(true);
    expect(requiresPreSubmitValidation(false, true)).toBe(false);
    expect(requiresPreSubmitValidation(true, false)).toBe(false);
  });
});

describe('computePreSubmitSubmitState', () => {
  it('returns not_required when validation is not needed', () => {
    expect(
      computePreSubmitSubmitState({
        required: false,
        validating: false,
        busy: false,
        analysis: null,
        isStale: false,
      }),
    ).toBe('not_required');
  });

  it('returns blocking when format or reference issues exist', () => {
    expect(
      computePreSubmitSubmitState({
        required: true,
        validating: false,
        busy: false,
        analysis: { ...cleanAnalysis, formatIssues: ['Missing abstract'] },
        isStale: false,
      }),
    ).toBe('blocking');
  });

  it('returns ready when grammar notes exist but not acknowledged', () => {
    expect(
      computePreSubmitSubmitState({
        required: true,
        validating: false,
        busy: false,
        analysis: {
          ...cleanAnalysis,
          acknowledged: false,
          grammarNotes: [{ excerpt: 'teh', suggestion: 'the', rule: 'SPELL' }],
        },
        isStale: false,
      }),
    ).toBe('ready');
  });
});

describe('preSubmitSubmitDisabled', () => {
  it('allows click for not_run to scroll to validation panel', () => {
    expect(preSubmitSubmitDisabled('not_run', false, true)).toBe(false);
  });

  it('disables submit for blocking states', () => {
    expect(preSubmitSubmitDisabled('blocking', false, true)).toBe(true);
  });
});
