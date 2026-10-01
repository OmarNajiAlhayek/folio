import { describe, expect, it } from 'vitest';
import type { ReviewerDirectoryEntry } from '@/lib/queries/reviewers';
import {
  filterAndSortReviewers,
  reviewerInitials,
  reviewerKeywordList,
  reviewerLoadLevel,
  toSearchableReviewers,
} from '@/lib/reviewer-directory';

function reviewer(
  id: string,
  extra: Partial<ReviewerDirectoryEntry> = {},
): ReviewerDirectoryEntry {
  return {
    id,
    displayName: id,
    email: `${id}@uni.edu`,
    affiliation: null,
    orcid: null,
    reviewKeywords: null,
    availability: { available: true, unavailableUntil: null, note: null },
    capacity: { active: 0, max: null },
    stats: {
      invitations: 0,
      accepted: 0,
      declined: 0,
      completed: 0,
      acceptanceRate: null,
      avgDaysToRespond: null,
      avgDaysToComplete: null,
      onTimeRate: null,
      lastCompletedAt: null,
    },
    thisSubmissionStatus: null,
    conflictOfInterest: false,
    blockReason: null,
    ...extra,
  };
}

const pool = toSearchableReviewers([
  reviewer('Omar', {
    displayName: 'أحمد عمر',
    affiliation: 'كلية الهندسة',
    capacity: { active: 2, max: 3 },
    stats: { ...reviewer('x').stats, completed: 8, avgDaysToComplete: 12 },
  }),
  reviewer('Lina', {
    displayName: 'Lina Haddad',
    reviewKeywords: 'machine learning, NLP',
    capacity: { active: 0, max: null },
    stats: { ...reviewer('x').stats, completed: 2, avgDaysToComplete: 5 },
  }),
  reviewer('Sami', {
    displayName: 'Sami Khoury',
    availability: {
      available: false,
      unavailableUntil: '2026-12-01',
      note: null,
    },
    blockReason: 'unavailable',
    capacity: { active: 1, max: null },
  }),
]);

const run = (
  opts: Partial<Parameters<typeof filterAndSortReviewers>[1]> = {},
) =>
  filterAndSortReviewers(pool, {
    query: '',
    filter: 'all',
    sort: 'name',
    locale: 'en',
    ...opts,
  }).map((r) => r.id);

describe('filterAndSortReviewers', () => {
  it('finds Arabic names without hamza and affiliations without the article', () => {
    expect(run({ query: 'احمد' })).toEqual(['Omar']);
    expect(run({ query: 'هندسه' })).toEqual(['Omar']);
  });

  it('searches interests as well as names', () => {
    expect(run({ query: 'machine' })).toEqual(['Lina']);
  });

  it('narrows to reviewers who can be invited', () => {
    expect(run({ filter: 'invitable' }).sort()).toEqual(['Lina', 'Omar']);
    expect(run({ filter: 'unavailable' })).toEqual(['Sami']);
  });

  it('sorts by load, least busy first', () => {
    expect(run({ sort: 'load' })).toEqual(['Lina', 'Sami', 'Omar']);
  });

  it('puts reviewers with no reviews last when sorting by turnaround', () => {
    expect(run({ sort: 'turnaround' })).toEqual(['Lina', 'Omar', 'Sami']);
  });

  it('sorts by completed reviews, most first', () => {
    expect(run({ sort: 'completed' })).toEqual(['Omar', 'Lina', 'Sami']);
  });
});

describe('reviewerLoadLevel', () => {
  it('has no level without a limit', () => {
    expect(reviewerLoadLevel({ active: 9, max: null })).toBeNull();
  });

  it.each([
    [0, 3, 'ok'],
    [1, 3, 'ok'],
    [2, 3, 'high'],
    [3, 3, 'full'],
    [0, 1, 'ok'],
    [1, 1, 'full'],
  ] as const)('%i of %i is %s', (active, max, level) => {
    expect(reviewerLoadLevel({ active, max })).toBe(level);
  });
});

describe('reviewerKeywordList', () => {
  it('splits on Latin and Arabic commas and caps the count', () => {
    expect(reviewerKeywordList('NLP، تعلم الآلة, vision; graphs')).toEqual([
      'NLP',
      'تعلم الآلة',
      'vision',
    ]);
  });
});

describe('reviewerInitials', () => {
  it('takes the first and last word', () => {
    expect(reviewerInitials('Lina Al Haddad')).toBe('LH');
    expect(reviewerInitials('أحمد عمر')).toBe('أع');
  });
});
