import {
  isAtReviewCapacity,
  isReviewerAvailable,
  reviewerAvailabilityView,
  reviewerBlockReason,
  reviewerConflictOfInterest,
} from './reviewer-availability';
import type { Submission } from '../entities/submission.entity';

const TODAY = '2026-09-26';

describe('isReviewerAvailable', () => {
  it('is available while the switch is on', () => {
    expect(
      isReviewerAvailable(
        { reviewerAvailable: true, reviewerUnavailableUntil: null },
        TODAY,
      ),
    ).toBe(true);
  });

  it('is unavailable with the switch off and no return date', () => {
    expect(
      isReviewerAvailable(
        { reviewerAvailable: false, reviewerUnavailableUntil: null },
        TODAY,
      ),
    ).toBe(false);
  });

  it.each([
    ['2026-09-25', true],
    ['2026-09-26', true],
    ['2026-09-27', false],
  ])('with a return date of %s reads as available=%s', (until, expected) => {
    expect(
      isReviewerAvailable(
        { reviewerAvailable: false, reviewerUnavailableUntil: until },
        TODAY,
      ),
    ).toBe(expected);
  });
});

describe('reviewerAvailabilityView', () => {
  it('drops the absence details once the return date has passed', () => {
    expect(
      reviewerAvailabilityView(
        {
          reviewerAvailable: false,
          reviewerUnavailableUntil: '2026-09-01',
          reviewerUnavailableNote: 'Sabbatical',
        },
        TODAY,
      ),
    ).toEqual({ available: true, unavailableUntil: null, note: null });
  });

  it('carries the return date and note while away', () => {
    expect(
      reviewerAvailabilityView(
        {
          reviewerAvailable: false,
          reviewerUnavailableUntil: '2026-12-01',
          reviewerUnavailableNote: 'Sabbatical',
        },
        TODAY,
      ),
    ).toEqual({
      available: false,
      unavailableUntil: '2026-12-01',
      note: 'Sabbatical',
    });
  });
});

describe('isAtReviewCapacity', () => {
  it('never caps a reviewer without a limit', () => {
    expect(isAtReviewCapacity(99, null)).toBe(false);
  });

  it('caps at the limit, not after it', () => {
    expect(isAtReviewCapacity(2, 3)).toBe(false);
    expect(isAtReviewCapacity(3, 3)).toBe(true);
  });
});

describe('reviewerBlockReason', () => {
  const clear = {
    conflictOfInterest: false,
    alreadyAssigned: false,
    available: true,
    activeLoad: 0,
    maxActive: null,
  };

  it('is null when nothing blocks', () => {
    expect(reviewerBlockReason(clear)).toBeNull();
  });

  it('reports the most specific reason first', () => {
    const everything = {
      conflictOfInterest: true,
      alreadyAssigned: true,
      available: false,
      activeLoad: 3,
      maxActive: 3,
    };
    expect(reviewerBlockReason(everything)).toBe('conflict_of_interest');
    expect(
      reviewerBlockReason({ ...everything, conflictOfInterest: false }),
    ).toBe('already_assigned');
    expect(
      reviewerBlockReason({
        ...everything,
        conflictOfInterest: false,
        alreadyAssigned: false,
      }),
    ).toBe('unavailable');
    expect(reviewerBlockReason({ ...clear, activeLoad: 3, maxActive: 3 })).toBe(
      'at_capacity',
    );
  });
});

describe('reviewerConflictOfInterest', () => {
  const submission = {
    authorId: 'author-1',
    contributors: [{ email: ' Co.Author@Uni.edu ' }],
  } as Pick<Submission, 'authorId' | 'contributors'>;

  it('flags the submitting author', () => {
    expect(
      reviewerConflictOfInterest(submission, { id: 'author-1', email: 'a@x' }),
    ).toBe('author');
  });

  it('flags a contributor by email, ignoring case and spaces', () => {
    expect(
      reviewerConflictOfInterest(submission, {
        id: 'rev-1',
        email: 'co.author@uni.edu',
      }),
    ).toBe('contributor');
  });

  it('passes anyone else', () => {
    expect(
      reviewerConflictOfInterest(submission, {
        id: 'rev-2',
        email: 'other@uni.edu',
      }),
    ).toBeNull();
  });
});
