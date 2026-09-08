import { parseKeywordsFromStorage } from '@/lib/keywords';
import type { PublicationDetail } from '@/lib/publication-types';

/**
 * `ScholarlyArticle` JSON-LD for the public article page.
 *
 * Complements the `citation_*` tags rather than duplicating them: Scholar reads
 * the meta tags, while general search engines and Crossref-adjacent tooling
 * read schema.org. It is also where per-author affiliations and ORCIDs live,
 * because JSON-LD nests them under each author — meta tags cannot express that
 * association reliably (see `citation-meta.ts`).
 */

export type JsonLdValue =
  | string
  | number
  | JsonLdObject
  | JsonLdValue[]
  | undefined;

export type JsonLdObject = { [key: string]: JsonLdValue };

const PUBLISHER: JsonLdObject = {
  '@type': 'Organization',
  name: 'Damascus University',
};

function orcidUrl(orcid: string): string {
  return orcid.startsWith('http') ? orcid : `https://orcid.org/${orcid}`;
}

function authorNodes(article: PublicationDetail): JsonLdObject[] {
  const list = article.authors ?? [];
  if (list.length === 0) {
    const name = article.author?.displayName?.trim();
    return name ? [{ '@type': 'Person', name }] : [];
  }
  return list.map((a) => {
    const node: JsonLdObject = { '@type': 'Person', name: a.fullName };
    if (a.affiliation) {
      node.affiliation = { '@type': 'Organization', name: a.affiliation };
    }
    if (a.orcid) {
      // `identifier` is the ORCID itself; `sameAs` resolves it.
      node.identifier = a.orcid;
      node.sameAs = orcidUrl(a.orcid);
    }
    return node;
  });
}

/**
 * `Periodical` → `PublicationVolume` → `PublicationIssue` is the schema.org
 * chain for a journal article. The volume link is omitted rather than faked
 * when the issue carries none, since Damascus University cites العدد/السنة and
 * المجلد is genuinely optional.
 */
function isPartOfNode(article: PublicationDetail): JsonLdObject | undefined {
  const journal = article.journal;
  if (!journal) return undefined;

  const issns = [journal.eissn, journal.issn].filter((v): v is string =>
    Boolean(v),
  );
  const periodical: JsonLdObject = {
    '@type': 'Periodical',
    name: journal.titleEn,
    alternateName: journal.titleAr,
    publisher: PUBLISHER,
  };
  // Absent until the library supplies them; never a placeholder.
  if (issns.length > 0) periodical.issn = issns;

  const issue = article.issue;
  if (!issue) return periodical;

  const issueNode: JsonLdObject = {
    '@type': 'PublicationIssue',
    issueNumber: issue.number,
    datePublished: issue.publishedAt ?? undefined,
  };

  if (issue.volume != null) {
    issueNode.isPartOf = {
      '@type': 'PublicationVolume',
      volumeNumber: issue.volume,
      isPartOf: periodical,
    };
  } else {
    issueNode.isPartOf = periodical;
  }

  return issueNode;
}

export function buildScholarlyArticleJsonLd(
  article: PublicationDetail,
  articleUrl: string | null,
  pdfUrl: string | null,
): JsonLdObject {
  const keywords = [
    ...parseKeywordsFromStorage(article.keywords),
    ...parseKeywordsFromStorage(article.keywordsAr),
  ];

  const node: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: article.title,
    name: article.title,
    alternativeHeadline: article.titleAr ?? undefined,
    abstract: article.abstract,
    inLanguage: ['en', 'ar'],
    datePublished: article.publishedAt ?? undefined,
    author: authorNodes(article),
    publisher: PUBLISHER,
    isPartOf: isPartOfNode(article),
    url: articleUrl ?? undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
    // No `identifier` for a DOI: none is minted yet (EXTERNAL-ACTIONS A2), and
    // a fabricated one would be worse than none.
  };

  if (pdfUrl) {
    node.encoding = {
      '@type': 'MediaObject',
      encodingFormat: 'application/pdf',
      contentUrl: pdfUrl,
    };
  }

  return stripUndefined(node);
}

/** JSON-LD consumers treat an explicit null as a value; drop empties instead. */
function stripUndefined(value: JsonLdObject): JsonLdObject {
  const out: JsonLdObject = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[key] = v;
  }
  return out;
}

/**
 * Serialises for embedding in a `<script>` element.
 *
 * `<` is escaped so author-supplied text can never close the script element
 * early — an abstract containing `</script>` would otherwise break out of the
 * data block and become markup. This is the one genuine injection risk in
 * JSON-LD and it is not handled by `JSON.stringify` alone.
 */
export function serializeJsonLd(node: JsonLdObject): string {
  return JSON.stringify(node).replace(/</g, '\\u003c');
}
