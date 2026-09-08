import type { Journal } from '../entities/journal.entity';
import type { JournalIssue } from '../entities/journal-issue.entity';
import type { Submission } from '../entities/submission.entity';
import type { User } from '../entities/user.entity';
import {
  toPublicArticleAuthors,
  toPublicArticleCitation,
} from './public-article-citation';

const ENGJ = {
  slug: 'engj',
  titleAr: 'مجلة جامعة دمشق للعلوم الهندسية',
  titleEn: 'Damascus University Journal for Engineering Sciences',
  issn: null,
  eissn: null,
} as Journal;

const ISSUE_2026_1 = {
  year: 2026,
  number: 1,
  volume: null,
  titleAr: null,
  titleEn: null,
  publishedAt: new Date('2026-03-01T00:00:00Z'),
} as JournalIssue;

const AUTHOR = {
  displayName: 'Layla Haddad',
  affiliation: 'Damascus University',
  orcid: '0000-0002-1825-0097',
} as User;

function submission(over: Partial<Submission> = {}): Submission {
  return {
    author: AUTHOR,
    journal: ENGJ,
    issue: ISSUE_2026_1,
    contributors: null,
    ...over,
  } as Submission;
}

describe('toPublicArticleAuthors', () => {
  it('returns the contributor list in sortOrder, without duplicating the submitting author', () => {
    // The wizard pre-fills contributors[0] from the submitting user, so the
    // JSONB list is already complete — appending s.author would print Layla
    // twice on every citation.
    const s = submission({
      contributors: [
        {
          fullName: 'Omar Nasri',
          affiliation: 'Aleppo University',
          sortOrder: 1,
          isCorresponding: false,
        },
        {
          fullName: 'Layla Haddad',
          email: 'layla@example.edu',
          affiliation: 'Damascus University',
          sortOrder: 0,
          isCorresponding: true,
        },
      ],
    });

    const authors = toPublicArticleAuthors(s);

    expect(authors.map((a) => a.fullName)).toEqual([
      'Layla Haddad',
      'Omar Nasri',
    ]);
  });

  it('never exposes a contributor e-mail address', () => {
    const s = submission({
      contributors: [
        {
          fullName: 'Layla Haddad',
          email: 'layla@example.edu',
          affiliation: 'Damascus University',
          sortOrder: 0,
          isCorresponding: true,
        },
      ],
    });

    const authors = toPublicArticleAuthors(s);

    expect(authors[0]).not.toHaveProperty('email');
    expect(JSON.stringify(authors)).not.toContain('layla@example.edu');
  });

  it('carries the ORCID onto the account holder only', () => {
    const s = submission({
      contributors: [
        {
          fullName: 'Layla Haddad',
          affiliation: 'Damascus University',
          sortOrder: 0,
          isCorresponding: true,
        },
        {
          fullName: 'Omar Nasri',
          affiliation: 'Aleppo University',
          sortOrder: 1,
          isCorresponding: false,
        },
      ],
    });

    const authors = toPublicArticleAuthors(s);

    expect(authors[0].orcid).toBe('0000-0002-1825-0097');
    expect(authors[1].orcid).toBeNull();
  });

  it('matches the account holder regardless of case and padding', () => {
    const s = submission({
      contributors: [
        {
          fullName: '  layla haddad ',
          affiliation: 'Damascus University',
          sortOrder: 0,
          isCorresponding: true,
        },
      ],
    });

    expect(toPublicArticleAuthors(s)[0].orcid).toBe('0000-0002-1825-0097');
  });

  it('falls back to the submitting account when no contributor list was stored', () => {
    const authors = toPublicArticleAuthors(submission({ contributors: [] }));

    expect(authors).toEqual([
      {
        fullName: 'Layla Haddad',
        affiliation: 'Damascus University',
        orcid: '0000-0002-1825-0097',
        isCorresponding: true,
      },
    ]);
  });

  it('normalises a blank affiliation to null rather than an empty string', () => {
    const s = submission({
      contributors: [
        {
          fullName: 'Omar Nasri',
          affiliation: '   ',
          sortOrder: 0,
          isCorresponding: true,
        },
      ],
    });

    expect(toPublicArticleAuthors(s)[0].affiliation).toBeNull();
  });
});

describe('toPublicArticleCitation', () => {
  it('maps the journal and renders both issue citations', () => {
    const citation = toPublicArticleCitation(submission());

    expect(citation.journal).toEqual({
      slug: 'engj',
      titleAr: 'مجلة جامعة دمشق للعلوم الهندسية',
      titleEn: 'Damascus University Journal for Engineering Sciences',
      issn: null,
      eissn: null,
    });
    expect(citation.issue?.citationAr).toBe('العدد 1، 2026');
    expect(citation.issue?.citationEn).toBe('No. 1 (2026)');
  });

  it('returns nulls rather than throwing when the relations were not loaded', () => {
    const citation = toPublicArticleCitation(
      submission({ journal: undefined as unknown as Journal, issue: null }),
    );

    expect(citation.journal).toBeNull();
    expect(citation.issue).toBeNull();
  });
});
