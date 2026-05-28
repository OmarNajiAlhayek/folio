import { buildReviewerMatchQueryText, isReviewerMatchQuerySufficient } from './submission-reviewer-match.util';
import type { Submission } from '../entities/submission.entity';

describe('submission-reviewer-match.util', () => {
  it('builds query from abstract and keywords', () => {
    const s = {
      abstract: 'English abstract',
      abstractAr: null,
      keywords: 'kw1, kw2',
      keywordsAr: null,
    } as Submission;
    expect(buildReviewerMatchQueryText(s)).toContain('English abstract');
    expect(buildReviewerMatchQueryText(s)).toContain('kw1');
  });

  it('requires minimum query length', () => {
    expect(isReviewerMatchQuerySufficient('short')).toBe(false);
    expect(
      isReviewerMatchQuerySufficient(
        'A sufficiently long abstract for reviewer matching.',
      ),
    ).toBe(true);
  });
});
