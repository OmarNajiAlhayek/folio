import type { Submission } from '../entities/submission.entity';
import { toPublicArticleCitation } from '../public/public-article-citation';
import type { OaiConfig, OaiItem } from './oai-pmh.service';
import { oaiDatestamp, oaiDay, xmlEl, xmlEls, xmlText } from './oai-xml';

/**
 * Dublin Core (`oai_dc`) rendering — the format DOAJ and BASE actually harvest.
 *
 * `oai_dc` is the lowest common denominator of the protocol and every OAI
 * repository must support it, so this is the format that decides whether the
 * archive is harvestable at all. Richer formats can be added later as further
 * metadataPrefixes without disturbing this one.
 */

const OAI_DC_OPEN =
  '<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"' +
  ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
  ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
  ' xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/' +
  ' http://www.openarchives.org/OAI/2.0/oai_dc.xsd">';

/** URLs the renderer needs but should not have to construct itself. */
export type OaiRecordLinks = {
  articleUrl: string;
  journalUrl: string | null;
};

/**
 * Mirrors `parseKeywordList` in the submission lifecycle service and
 * `parseKeywordsFromStorage` on the frontend — deliberately the same rule, so
 * a `dc:subject` a harvester receives is exactly a keyword the article page
 * displays. The tag editor always re-serialises with ASCII commas, so stored
 * values use this separator set regardless of the language of the terms.
 */
function splitKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * `dc:source` carries the bibliographic home of the article: journal, issue and
 * ISSN. The ISSN segment simply does not appear while the column is null — an
 * absent identifier is honest, whereas a placeholder one is a data error that
 * propagates into every aggregator that harvests it.
 */
function sourceStrings(s: Submission): string[] {
  const { journal, issue } = toPublicArticleCitation(s);
  if (!journal) return [];

  const out: string[] = [
    issue ? `${journal.titleEn}, ${issue.citationEn}` : journal.titleEn,
    issue ? `${journal.titleAr}، ${issue.citationAr}` : journal.titleAr,
  ];
  if (journal.issn) out.push(`ISSN ${journal.issn}`);
  if (journal.eissn) out.push(`EISSN ${journal.eissn}`);
  return out;
}

export function renderOaiDc(
  s: Submission,
  cfg: OaiConfig,
  links: OaiRecordLinks,
): string {
  const { authors } = toPublicArticleCitation(s);

  const parts: string[] = [
    ...xmlEls('dc:title', [s.title, s.titleAr]),
    ...xmlEls(
      'dc:creator',
      authors.map((a) => a.fullName),
    ),
    ...xmlEls('dc:subject', [
      ...splitKeywords(s.keywords),
      ...splitKeywords(s.keywordsAr),
      ...(s.disciplines ?? []),
    ]),
    ...xmlEls('dc:description', [s.abstract, s.abstractAr]),
    xmlEl('dc:publisher', cfg.publisher),
    xmlEl('dc:date', s.publishedAt ? oaiDay(s.publishedAt) : null),
    xmlEl('dc:type', 'text'),
    xmlEl('dc:type', s.articleType),
    xmlEl('dc:format', 'text/html'),
    xmlEl('dc:identifier', links.articleUrl),
    ...xmlEls('dc:language', ['en', 'ar']),
    ...xmlEls('dc:source', sourceStrings(s)),
    xmlEl('dc:relation', links.journalUrl),
    // Present only once an open-access licence has actually been approved
    // (docs/EXTERNAL-ACTIONS.md B1); never a guessed default.
    xmlEl('dc:rights', cfg.rights),
  ];

  return `${OAI_DC_OPEN}${parts.filter((p) => p !== '').join('')}</oai_dc:dc>`;
}

export function renderHeader(
  item: OaiItem,
  identifier: string,
  datestamp: Date,
): string {
  const journalSlug = item.submission.journal?.slug ?? null;
  const status = item.deleted ? ' status="deleted"' : '';
  return (
    `<header${status}>` +
    `<identifier>${xmlText(identifier)}</identifier>` +
    `<datestamp>${oaiDatestamp(datestamp)}</datestamp>` +
    (journalSlug ? `<setSpec>${xmlText(journalSlug)}</setSpec>` : '') +
    '</header>'
  );
}

/**
 * A deleted record is a header and nothing else — the protocol forbids
 * shipping metadata for one, which is the point: the harvester is being told
 * to drop what it already holds.
 */
export function renderRecord(
  item: OaiItem,
  identifier: string,
  datestamp: Date,
  cfg: OaiConfig,
  links: OaiRecordLinks,
): string {
  const header = renderHeader(item, identifier, datestamp);
  if (item.deleted) return `<record>${header}</record>`;
  return (
    `<record>${header}` +
    `<metadata>${renderOaiDc(item.submission, cfg, links)}</metadata>` +
    '</record>'
  );
}
