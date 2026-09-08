import type { PublicationDetail } from './publication-types';
import {
  buildScholarlyArticleJsonLd,
  serializeJsonLd,
  type JsonLdObject,
} from './scholarly-jsonld';

function article(over: Partial<PublicationDetail> = {}): PublicationDetail {
  return {
    id: 'a1',
    slug: 'a-study',
    title: 'A Study of Beams',
    titleAr: 'دراسة في الجوائز',
    abstract: 'English abstract.',
    abstractAr: 'ملخص عربي.',
    keywords: 'beams, concrete',
    keywordsAr: null,
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
    ],
    files: [],
    ...over,
  };
}

const URL_ = 'https://journals.example.edu/en/publications/a-study';

describe('buildScholarlyArticleJsonLd', () => {
  it('is a ScholarlyArticle', () => {
    const node = buildScholarlyArticleJsonLd(article(), URL_, null);
    expect(node['@type']).toBe('ScholarlyArticle');
    expect(node['@context']).toBe('https://schema.org');
  });

  it('nests affiliation and ORCID under the author, where meta tags cannot', () => {
    const node = buildScholarlyArticleJsonLd(article(), URL_, null);
    const author = (node.author as JsonLdObject[])[0];
    expect(author.name).toBe('Layla Haddad');
    expect((author.affiliation as JsonLdObject).name).toBe(
      'Damascus University',
    );
    expect(author.sameAs).toBe('https://orcid.org/0000-0002-1825-0097');
  });

  it('links issue to periodical directly when there is no volume', () => {
    const node = buildScholarlyArticleJsonLd(article(), URL_, null);
    const issue = node.isPartOf as JsonLdObject;
    expect(issue['@type']).toBe('PublicationIssue');
    expect((issue.isPartOf as JsonLdObject)['@type']).toBe('Periodical');
  });

  it('inserts a PublicationVolume when the issue has one', () => {
    const withVolume = article({
      issue: { ...article().issue!, volume: 42 },
    });
    const node = buildScholarlyArticleJsonLd(withVolume, URL_, null);
    const issue = node.isPartOf as JsonLdObject;
    const volume = issue.isPartOf as JsonLdObject;
    expect(volume['@type']).toBe('PublicationVolume');
    expect(volume.volumeNumber).toBe(42);
    expect((volume.isPartOf as JsonLdObject)['@type']).toBe('Periodical');
  });

  it('omits issn while the columns are null', () => {
    const node = buildScholarlyArticleJsonLd(article(), URL_, null);
    const periodical = (node.isPartOf as JsonLdObject).isPartOf as JsonLdObject;
    expect(periodical).not.toHaveProperty('issn');
  });

  it('lists both ISSNs once they exist, electronic first', () => {
    const withIssn = article({
      journal: { ...article().journal!, issn: '2079-3170', eissn: '2790-5535' },
    });
    const node = buildScholarlyArticleJsonLd(withIssn, URL_, null);
    const periodical = (node.isPartOf as JsonLdObject).isPartOf as JsonLdObject;
    expect(periodical.issn).toEqual(['2790-5535', '2079-3170']);
  });

  it('carries no DOI identifier, since none is minted', () => {
    expect(
      buildScholarlyArticleJsonLd(article(), URL_, null),
    ).not.toHaveProperty('identifier');
  });

  it('attaches the PDF as an encoding when there is one', () => {
    const node = buildScholarlyArticleJsonLd(
      article(),
      URL_,
      'https://x.test/a.pdf',
    );
    expect((node.encoding as JsonLdObject).contentUrl).toBe(
      'https://x.test/a.pdf',
    );
  });
});

describe('serializeJsonLd', () => {
  it('escapes < so author text cannot close the script element', () => {
    // An abstract containing </script> would otherwise break out of the data
    // block and become markup. JSON.stringify alone does not prevent this.
    const node = buildScholarlyArticleJsonLd(
      article({ abstract: 'Ends with </script><img src=x onerror=alert(1)>' }),
      URL_,
      null,
    );
    const json = serializeJsonLd(node);
    expect(json).not.toContain('</script>');
    expect(json).not.toContain('<img');
    // Only `<` needs escaping: the parser closes a script element on a literal
    // `</script` sequence, so removing the `<` is what defeats it. The `>` is
    // harmless and stays readable.
    expect(json).toContain('\\u003c/script>');
    expect(json).not.toContain('<');
  });

  it('still parses back to the same object', () => {
    const node = buildScholarlyArticleJsonLd(article(), URL_, null);
    expect(JSON.parse(serializeJsonLd(node))).toEqual(node);
  });
});
