import { JournalIssueStatus } from '../entities/journal-issue-status.enum';
import { JOURNAL_CATALOG } from './journal-catalog';
import { SEED_ISSUE_SPECS } from './seed-journals';

describe('seed issue fixtures', () => {
  it('covers two years and mixes published with an open issue', () => {
    const years = new Set(SEED_ISSUE_SPECS.map((s) => s.year));
    expect(years.size).toBeGreaterThanOrEqual(2);
    expect(
      SEED_ISSUE_SPECS.some((s) => s.status === JournalIssueStatus.PUBLISHED),
    ).toBe(true);
    expect(
      SEED_ISSUE_SPECS.some((s) => s.status === JournalIssueStatus.OPEN),
    ).toBe(true);
  });

  it('uses unique (year, number) pairs so the journal unique key holds', () => {
    const keys = SEED_ISSUE_SPECS.map((s) => `${s.year}:${s.number}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('seeds the same issue shape for every catalog journal', () => {
    expect(JOURNAL_CATALOG.length * SEED_ISSUE_SPECS.length).toBe(27);
  });
});
