import type { Submission } from '../entities/submission.entity';
import { issueCitationAr, issueCitationEn } from '../journals/journal-citation';

/**
 * The citation view of a published article — the fields an indexing service
 * asks for, in one place.
 *
 * Two consumers share this deliberately: the public article endpoint (which
 * feeds Google Scholar's `citation_*` tags and `ScholarlyArticle` JSON-LD) and
 * the OAI-PMH endpoint (which feeds Dublin Core to DOAJ and BASE). They must
 * describe the same article the same way — a harvester that disagrees with the
 * page it harvested is a data-quality complaint, so the mapping lives here
 * rather than being written twice.
 *
 * Nothing here is exposed that is not already on the published article page.
 * In particular contributor **e-mail addresses are never included**: they are
 * stored in the same JSONB blob and are the one field in it that must not
 * leave the editorial side.
 */

export type PublicArticleAuthor = {
  fullName: string;
  affiliation: string | null;
  /** Only the submitting account holds an ORCID; free-text contributors do not. */
  orcid: string | null;
  isCorresponding: boolean;
};

export type PublicArticleJournal = {
  slug: string;
  titleAr: string;
  titleEn: string;
  issn: string | null;
  eissn: string | null;
};

export type PublicArticleIssue = {
  year: number;
  number: number;
  volume: number | null;
  titleAr: string | null;
  titleEn: string | null;
  publishedAt: Date | null;
  citationAr: string;
  citationEn: string;
};

export type PublicArticleCitation = {
  journal: PublicArticleJournal | null;
  issue: PublicArticleIssue | null;
  authors: PublicArticleAuthor[];
};

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * Every author of the article, in the order the author list was entered.
 *
 * `contributors[0]` is pre-filled from the submitting user's profile by the
 * wizard, so the JSONB list is already the *complete* author list — appending
 * `s.author` to it would print the first author twice in every citation. The
 * submitting account is instead located by name so its ORCID can be carried
 * across; an unmatched contributor simply has none, which is correct.
 */
export function toPublicArticleAuthors(s: Submission): PublicArticleAuthor[] {
  const accountName = s.author?.displayName?.trim() ?? '';
  const accountOrcid = s.author?.orcid ?? null;

  const contributors = (s.contributors ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (contributors.length > 0) {
    return contributors.map((c) => ({
      fullName: c.fullName,
      affiliation: c.affiliation?.trim() ? c.affiliation : null,
      orcid:
        accountName && sameName(c.fullName, accountName) ? accountOrcid : null,
      isCorresponding: c.isCorresponding,
    }));
  }

  // Pre-wizard rows carry no contributor list; the submitting account is then
  // the only author we can honestly name.
  if (!accountName) return [];
  return [
    {
      fullName: accountName,
      affiliation: s.author?.affiliation ?? null,
      orcid: accountOrcid,
      isCorresponding: true,
    },
  ];
}

export function toPublicArticleJournal(
  s: Submission,
): PublicArticleJournal | null {
  if (!s.journal) return null;
  return {
    slug: s.journal.slug,
    titleAr: s.journal.titleAr,
    titleEn: s.journal.titleEn,
    // Null until the DU library supplies them — see docs/EXTERNAL-ACTIONS.md A1.
    issn: s.journal.issn,
    eissn: s.journal.eissn,
  };
}

export function toPublicArticleIssue(s: Submission): PublicArticleIssue | null {
  if (!s.issue) return null;
  return {
    year: s.issue.year,
    number: s.issue.number,
    volume: s.issue.volume,
    titleAr: s.issue.titleAr,
    titleEn: s.issue.titleEn,
    publishedAt: s.issue.publishedAt,
    citationAr: issueCitationAr(s.issue),
    citationEn: issueCitationEn(s.issue),
  };
}

export function toPublicArticleCitation(s: Submission): PublicArticleCitation {
  return {
    journal: toPublicArticleJournal(s),
    issue: toPublicArticleIssue(s),
    authors: toPublicArticleAuthors(s),
  };
}
