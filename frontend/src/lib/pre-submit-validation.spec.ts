import { describe, expect, it } from 'vitest';
import {
  apiCodeToFieldErrors,
  fileFieldKey,
} from '@/lib/submission-field-errors';
import { PRE_SUBMIT_VALIDATION_FIELD } from '@/lib/pre-submit-validation';
import {
  computePreSubmitSubmitState,
  preSubmitSubmitDisabled,
  requiresPreSubmitValidation,
} from '@folio/shared/compose';

describe('requiresPreSubmitValidation', () => {
  it('is true only when constructor draft is presented', () => {
    expect(requiresPreSubmitValidation(true, true)).toBe(true);
    expect(requiresPreSubmitValidation(false, true)).toBe(false);
  });
});

describe('computePreSubmitSubmitState', () => {
  it('returns ready when analysis has no blocking issues', () => {
    expect(
      computePreSubmitSubmitState({
        required: true,
        validating: false,
        busy: false,
        isStale: false,
        analysis: {
          id: 'a1',
          analyzedAt: '2026-01-01T00:00:00.000Z',
          contentHash: 'hash',
          formatIssues: [],
          grammarNotes: [],
          referenceIssues: [],
          aiUnavailable: false,
          acknowledged: true,
          acknowledgedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ).toBe('ready');
  });
});

describe('preSubmitSubmitDisabled', () => {
  it('keeps not_run clickable so authors can scroll to validation', () => {
    expect(preSubmitSubmitDisabled('not_run', false, true)).toBe(false);
  });
});

describe('apiCodeToFieldErrors pre-submit codes', () => {
  it('maps pre-submit API codes to validation field', () => {
    for (const code of [
      'PRE_SUBMIT_ANALYSIS_REQUIRED',
      'PRE_SUBMIT_ANALYSIS_STALE',
      'PRE_SUBMIT_BLOCKING_ISSUES',
    ] as const) {
      expect(apiCodeToFieldErrors(code).has(PRE_SUBMIT_VALIDATION_FIELD)).toBe(
        true,
      );
    }
    expect(apiCodeToFieldErrors('SUBMISSION_INCOMPLETE_COI').has('coi')).toBe(
      true,
    );
    expect(
      apiCodeToFieldErrors('SUBMISSION_INCOMPLETE_COI').has(
        fileFieldKey('cover_letter'),
      ),
    ).toBe(false);
  });
});
