import { authorNames, buildCitationMeta, findPublicPdf } from './citation-meta';
import type { PublicationDetail } from './publication-types';

function article(over: Partial<PublicationDetail> = {}): PublicationDetail {
  return {
    id: 'a1',
    slug: 'a-study',
    title: 'A Study of Beams',
    titleAr: 'دراسة في الجوائز',
    abstract: 'English abstract.',
    abstractAr: 'ملخص عربي.',
    keywords: 'beams, concrete',
    keywordsAr: 'جوائز, خرسانة',
    publishedAt: '2026-03-01T00:00:00.000Z',
    journal: {
      slug: 'engj',
      titleAr: 'مجلة جامعة دمشق للعلوم الهندسية',
      titleEn: 'Damascus University Journal for Engineering Sciences',
      issn: null,
      eissn: null,
    },
    issue: {
      year: 2026,
      number: 1,
      volume: null,
      titleAr: null,
      titleEn: null,
      publishedAt: '2026-03-01T00:00:00.000Z',
      citationAr: 'العدد 1، 2026',
      citationEn: 'No. 1 (2026)',
    },
    authors: [
      {
        fullName: 'Layla Haddad',
        affiliation: 'Damascus University',
        orcid: '0000-0002-1825-0097',
        isCorresponding: true,
      },
      {
        fullName: 'Omar Nasri',
        affiliation: 'Aleppo University',
        orcid: null,
        isCorresponding: false,
      },
    ],
    files: [],
    ...over,
  };
}

const URL_ = 'https://journals.example.edu/en/publications/a-study';

function build(
  over: Partial<PublicationDetail> = {},
  pdfUrl: string | null = null,
) {
  return buildCitationMeta({
    article: article(over),
    articleUrl: URL_,
    pdfUrl,
  });
}

describe('buildCitationMeta', () => {
  it('emits one citation_author per author, in order', () => {
    // The array form is what makes Next render repeated <meta> tags; a joined
    // string would be a single tag Scholar reads as one author.
    expect(build().citation_author).toEqual(['Layla Haddad', 'Omar Nasri']);
  });

  it('does not emit citation_author_institution', () => {
    // Scholar pairs an institution with the author tag it follows, and Next
    // groups `other` by key, so every institution would be mis-attributed.
    expect(build()).not.toHaveProperty('citation_author_institution');
  });

  it('formats the publication date as YYYY/MM/DD, not ISO', () => {
    expect(build().citation_publication_date).toBe('2026/03/01');
  });

  it('carries the journal title and the issue number', () => {
    const meta = build();
    expect(meta.citation_journal_title).toBe(
      'Damascus University Journal for Engineering Sciences',
    );
    expect(meta.citation_issue).toBe('1');
  });

  it('omits citation_volume when the issue carries no volume', () => {
    expect(build()).not.toHaveProperty('citation_volume');
  });

  it('emits citation_volume when there is one', () => {
    const meta = build({
      issue: { ...article().issue!, volume: 42 },
    });
    expect(meta.citation_volume).toBe('42');
  });

  it('omits citation_issn entirely while both ISSN columns are null', () => {
    expect(build()).not.toHaveProperty('citation_issn');
  });

  it('prefers the e-ISSN, which identifies the electronic edition', () => {
    const meta = build({
      journal: { ...article().journal!, issn: '2079-3170', eissn: '2790-5535' },
    });
    expect(meta.citation_issn).toBe('2790-5535');
  });

  it('falls back to the print ISSN when there is no e-ISSN', () => {
    const meta = build({
      journal: { ...article().journal!, issn: '2079-3170', eissn: null },
    });
    expect(meta.citation_issn).toBe('2079-3170');
  });

  it('never emits page numbers, which this platform does not have', () => {
    const meta = build();
    expect(meta).not.toHaveProperty('citation_firstpage');
    expect(meta).not.toHaveProperty('citation_lastpage');
  });

  it('emits citation_pdf_url only when a public PDF exists', () => {
    expect(build()).not.toHaveProperty('citation_pdf_url');
    expect(build({}, 'https://x.test/a.pdf').citation_pdf_url).toBe(
      'https://x.test/a.pdf',
    );
  });

  it('merges both keyword languages into one citation_keywords', () => {
    expect(build().citation_keywords).toBe('beams; concrete; جوائز; خرسانة');
  });

  it('omits the date entirely rather than emitting an invalid one', () => {
    expect(build({ publishedAt: null })).not.toHaveProperty(
      'citation_publication_date',
    );
    expect(build({ publishedAt: 'not-a-date' })).not.toHaveProperty(
      'citation_publication_date',
    );
  });
});

describe('authorNames', () => {
  it('falls back to the submitting account when no author list is present', () => {
    const a = article({ authors: [], author: { displayName: 'Solo Author' } });
    expect(authorNames(a)).toEqual(['Solo Author']);
  });

  it('returns an empty list rather than a blank name', () => {
    expect(authorNames(article({ authors: [], author: undefined }))).toEqual(
      [],
    );
  });
});

describe('findPublicPdf', () => {
  it('finds a PDF by mime type', () => {
    const a = article({
      files: [
        { id: 'f1', originalName: 'data.csv', mimeType: 'text/csv' },
        { id: 'f2', originalName: 'paper.pdf', mimeType: 'application/pdf' },
      ],
    });
    expect(findPublicPdf(a)?.id).toBe('f2');
  });

  it('falls back to the file extension', () => {
    const a = article({
      files: [
        {
          id: 'f3',
          originalName: 'paper.PDF',
          mimeType: 'application/octet-stream',
        },
      ],
    });
    expect(findPublicPdf(a)?.id).toBe('f3');
  });

  it('returns null when there is no PDF', () => {
    expect(findPublicPdf(article({ files: [] }))).toBeNull();
  });
});
