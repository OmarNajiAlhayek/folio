import type { Journal } from '../entities/journal.entity';
import type { JournalIssue } from '../entities/journal-issue.entity';
import type { Submission } from '../entities/submission.entity';
import type { User } from '../entities/user.entity';
import { renderHeader, renderOaiDc, renderRecord } from './oai-dc';
import type { OaiConfig, OaiItem } from './oai-pmh.service';

const CFG: OaiConfig = {
  siteUrl: 'https://journals.example.edu',
  repositoryDomain: 'journals.example.edu',
  repositoryName: 'Damascus University Journals',
  adminEmail: 'ojs@example.edu',
  publisher: 'Damascus University',
  rights: null,
};

const LINKS = {
  articleUrl: 'https://journals.example.edu/en/publications/a-study',
  journalUrl: 'https://journals.example.edu/en/journals/engj',
};

const ENGJ = {
  slug: 'engj',
  titleAr: 'مجلة جامعة دمشق للعلوم الهندسية',
  titleEn: 'Damascus University Journal for Engineering Sciences',
  issn: null,
  eissn: null,
} as Journal;

const ISSUE = {
  year: 2026,
  number: 1,
  volume: null,
  titleAr: null,
  titleEn: null,
  publishedAt: new Date('2026-03-01T00:00:00Z'),
} as JournalIssue;

function article(over: Partial<Submission> = {}): Submission {
  return {
    slug: 'a-study',
    title: 'A Study of Beams',
    titleAr: 'دراسة في الجوائز',
    abstract: 'English abstract.',
    abstractAr: 'ملخص عربي.',
    keywords: 'beams, concrete',
    // The tag editor always re-serialises with ASCII commas, whatever the
    // language of the terms, so this is the shape actually stored.
    keywordsAr: 'جوائز, خرسانة',
    disciplines: ['العلوم الهندسية'],
    articleType: 'research_article',
    publishedAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-02T10:00:00Z'),
    author: { displayName: 'Layla Haddad', orcid: null } as User,
    contributors: [
      {
        fullName: 'Layla Haddad',
        email: 'layla@example.edu',
        affiliation: 'Damascus University',
        sortOrder: 0,
        isCorresponding: true,
      },
    ],
    journal: ENGJ,
    issue: ISSUE,
    ...over,
  } as Submission;
}

describe('renderOaiDc', () => {
  it('emits both titles and both abstracts', () => {
    const xml = renderOaiDc(article(), CFG, LINKS);
    expect(xml).toContain('<dc:title>A Study of Beams</dc:title>');
    expect(xml).toContain('<dc:title>دراسة في الجوائز</dc:title>');
    expect(xml).toContain('<dc:description>English abstract.</dc:description>');
    expect(xml).toContain('<dc:description>ملخص عربي.</dc:description>');
  });

  it('splits keyword columns into one dc:subject each', () => {
    const xml = renderOaiDc(article(), CFG, LINKS);
    expect(xml).toContain('<dc:subject>beams</dc:subject>');
    expect(xml).toContain('<dc:subject>concrete</dc:subject>');
    expect(xml).toContain('<dc:subject>جوائز</dc:subject>');
    expect(xml).toContain('<dc:subject>خرسانة</dc:subject>');
  });

  it('names the article URL as dc:identifier and the journal as dc:relation', () => {
    const xml = renderOaiDc(article(), CFG, LINKS);
    expect(xml).toContain(`<dc:identifier>${LINKS.articleUrl}</dc:identifier>`);
    expect(xml).toContain(`<dc:relation>${LINKS.journalUrl}</dc:relation>`);
  });

  it('carries journal and issue into dc:source in both languages', () => {
    const xml = renderOaiDc(article(), CFG, LINKS);
    expect(xml).toContain(
      '<dc:source>Damascus University Journal for Engineering Sciences, No. 1 (2026)</dc:source>',
    );
    expect(xml).toContain('العدد 1، 2026');
  });

  it('omits the ISSN entirely while the column is null', () => {
    // A placeholder ISSN would propagate into every aggregator that harvests
    // it; absence is the honest state until the library supplies the numbers.
    expect(renderOaiDc(article(), CFG, LINKS)).not.toContain('ISSN');
  });

  it('includes the ISSN once it is set', () => {
    const withIssn = article({
      journal: { ...ENGJ, issn: '2079-3170', eissn: '2790-5535' } as Journal,
    });
    const xml = renderOaiDc(withIssn, CFG, LINKS);
    expect(xml).toContain('<dc:source>ISSN 2079-3170</dc:source>');
    expect(xml).toContain('<dc:source>EISSN 2790-5535</dc:source>');
  });

  it('omits dc:rights until a licence is approved', () => {
    expect(renderOaiDc(article(), CFG, LINKS)).not.toContain('dc:rights');
  });

  it('emits dc:rights when one is configured', () => {
    const xml = renderOaiDc(article(), { ...CFG, rights: 'CC BY 4.0' }, LINKS);
    expect(xml).toContain('<dc:rights>CC BY 4.0</dc:rights>');
  });

  it('never leaks a contributor e-mail address', () => {
    expect(renderOaiDc(article(), CFG, LINKS)).not.toContain(
      'layla@example.edu',
    );
  });

  it('escapes author-supplied markup rather than emitting it', () => {
    const hostile = article({ title: 'Beams & <script>alert(1)</script>' });
    const xml = renderOaiDc(hostile, CFG, LINKS);
    expect(xml).toContain(
      '<dc:title>Beams &amp; &lt;script&gt;alert(1)&lt;/script&gt;</dc:title>',
    );
    expect(xml).not.toContain('<script>');
  });

  it('renders dc:date as the publication day', () => {
    expect(renderOaiDc(article(), CFG, LINKS)).toContain(
      '<dc:date>2026-03-01</dc:date>',
    );
  });
});

describe('renderHeader', () => {
  const item: OaiItem = { submission: article(), deleted: false };

  it('carries the identifier, datestamp and journal setSpec', () => {
    const xml = renderHeader(
      item,
      'oai:journals.example.edu:a-study',
      new Date('2026-03-02T10:00:00Z'),
    );
    expect(xml).toContain(
      '<identifier>oai:journals.example.edu:a-study</identifier>',
    );
    expect(xml).toContain('<datestamp>2026-03-02T10:00:00Z</datestamp>');
    expect(xml).toContain('<setSpec>engj</setSpec>');
    expect(xml).not.toContain('status="deleted"');
  });

  it('marks a retracted article deleted', () => {
    const xml = renderHeader(
      { submission: article(), deleted: true },
      'oai:journals.example.edu:a-study',
      new Date('2026-03-02T10:00:00Z'),
    );
    expect(xml).toContain('<header status="deleted">');
  });
});

describe('renderRecord', () => {
  it('ships metadata for a live record', () => {
    const xml = renderRecord(
      { submission: article(), deleted: false },
      'oai:journals.example.edu:a-study',
      new Date('2026-03-02T10:00:00Z'),
      CFG,
      LINKS,
    );
    expect(xml).toContain('<metadata>');
    expect(xml).toContain('A Study of Beams');
  });

  it('ships a header alone for a deleted record, as the protocol requires', () => {
    const xml = renderRecord(
      { submission: article(), deleted: true },
      'oai:journals.example.edu:a-study',
      new Date('2026-03-02T10:00:00Z'),
      CFG,
      LINKS,
    );
    expect(xml).not.toContain('<metadata>');
    expect(xml).not.toContain('A Study of Beams');
    expect(xml).toContain('status="deleted"');
  });
});
