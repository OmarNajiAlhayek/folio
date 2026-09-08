import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { renderHeader, renderRecord, type OaiRecordLinks } from './oai-dc';
import {
  OaiPmhService,
  type OaiConfig,
  type OaiItem,
  type OaiListFilters,
} from './oai-pmh.service';
import { oaiDatestamp, parseOaiDate, xmlText } from './oai-xml';

/** The only metadata format served; every OAI repository must support it. */
const METADATA_PREFIX = 'oai_dc';

const OAI_ENVELOPE_OPEN =
  '<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"' +
  ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
  ' xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/' +
  ' http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">';

type OaiErrorCode =
  | 'badArgument'
  | 'badResumptionToken'
  | 'badVerb'
  | 'cannotDisseminateFormat'
  | 'idDoesNotExist'
  | 'noRecordsMatch'
  | 'noSetHierarchy';

class OaiError extends Error {
  constructor(
    readonly code: OaiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Arguments each verb accepts, so anything else is a `badArgument`. */
const ALLOWED_ARGS: Record<string, readonly string[]> = {
  Identify: [],
  ListMetadataFormats: ['identifier'],
  ListSets: ['resumptionToken'],
  ListIdentifiers: [
    'from',
    'until',
    'metadataPrefix',
    'set',
    'resumptionToken',
  ],
  ListRecords: ['from', 'until', 'metadataPrefix', 'set', 'resumptionToken'],
  GetRecord: ['identifier', 'metadataPrefix'],
};

type ResumptionState = {
  o: number;
  f?: string;
  u?: string;
  s?: string;
};

function encodeToken(state: ResumptionState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeToken(raw: string): ResumptionState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new OaiError('badResumptionToken', 'Malformed resumptionToken');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as ResumptionState).o !== 'number' ||
    !Number.isInteger((parsed as ResumptionState).o) ||
    (parsed as ResumptionState).o < 0
  ) {
    throw new OaiError('badResumptionToken', 'Malformed resumptionToken');
  }
  return parsed as ResumptionState;
}

/**
 * OAI-PMH 2.0 over Dublin Core — the interface DOAJ, BASE and OpenAIRE harvest.
 *
 * Deliberately mounted under the normal `api/v1` prefix so the public base URL
 * is `<site>/api/v1/oai`: the frontend already proxies `/api/v1/*` to this
 * service, so one URL works from the public domain with no extra routing.
 *
 * Excluded from Swagger — the contract here is the OAI protocol specification,
 * not this repository's REST conventions, and rendering it as a REST endpoint
 * in the API docs would misdescribe it.
 */
@ApiExcludeController()
@Controller('oai')
@Throttle({ public: {} })
export class OaiPmhController {
  constructor(private readonly oai: OaiPmhService) {}

  @Get()
  async handle(
    @Query() query: Record<string, string | string[] | undefined>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.type('text/xml; charset=utf-8');

    const cfg = this.oai.resolveConfig();
    if ('missing' in cfg) {
      // Not a protocol error: the repository is not configured to have an
      // identity yet, and inventing one would mint permanent identifiers that
      // later have to change. See docs/EXTERNAL-ACTIONS.md A3/A7.
      res.status(503);
      res.type('text/plain; charset=utf-8');
      return (
        'OAI-PMH endpoint is not configured.\n' +
        `Missing required settings: ${cfg.missing.join(', ')}\n`
      );
    }

    const baseUrl = `${cfg.siteUrl}/api/v1/oai`;

    try {
      const verb = single(query.verb);
      if (!verb || !(verb in ALLOWED_ARGS)) {
        throw new OaiError('badVerb', 'Illegal or missing verb');
      }
      assertNoUnknownArgs(verb, query);

      const body = await this.dispatch(verb, query, cfg, baseUrl);
      return envelope(body, requestTag(baseUrl, verb, query));
    } catch (err) {
      if (err instanceof OaiError) {
        // badVerb and badArgument must echo the base URL with no attributes,
        // because the request they describe was not intelligible.
        const bare = err.code === 'badVerb' || err.code === 'badArgument';
        // Not `single()` here: it throws on a repeated argument, and throwing
        // from inside the error handler would lose the error being reported.
        const rawVerb = typeof query.verb === 'string' ? query.verb.trim() : '';
        const reqTag = bare
          ? `<request>${xmlText(baseUrl)}</request>`
          : requestTag(baseUrl, rawVerb, query);
        return envelope(
          `<error code="${err.code}">${xmlText(err.message)}</error>`,
          reqTag,
        );
      }
      throw err;
    }
  }

  private async dispatch(
    verb: string,
    query: Record<string, string | string[] | undefined>,
    cfg: OaiConfig,
    baseUrl: string,
  ): Promise<string> {
    switch (verb) {
      case 'Identify':
        return this.identify(cfg, baseUrl);
      case 'ListMetadataFormats':
        return this.listMetadataFormats(cfg, query);
      case 'ListSets':
        return this.listSets();
      case 'ListIdentifiers':
      case 'ListRecords':
        return this.listItems(verb, query, cfg);
      case 'GetRecord':
        return this.getRecord(query, cfg);
      default:
        throw new OaiError('badVerb', 'Illegal or missing verb');
    }
  }

  private async identify(cfg: OaiConfig, baseUrl: string): Promise<string> {
    const earliest = await this.oai.earliestDatestamp();
    return (
      '<Identify>' +
      `<repositoryName>${xmlText(cfg.repositoryName)}</repositoryName>` +
      `<baseURL>${xmlText(baseUrl)}</baseURL>` +
      '<protocolVersion>2.0</protocolVersion>' +
      `<adminEmail>${xmlText(cfg.adminEmail)}</adminEmail>` +
      `<earliestDatestamp>${oaiDatestamp(earliest)}</earliestDatestamp>` +
      // Retractions are published as deleted headers, but the tombstone is not
      // guaranteed to survive a future data migration, so `transient` is the
      // honest declaration.
      '<deletedRecord>transient</deletedRecord>' +
      '<granularity>YYYY-MM-DDThh:mm:ssZ</granularity>' +
      '<description>' +
      '<oai-identifier xmlns="http://www.openarchives.org/OAI/2.0/oai-identifier"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
      ' xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai-identifier' +
      ' http://www.openarchives.org/OAI/2.0/oai-identifier.xsd">' +
      '<scheme>oai</scheme>' +
      `<repositoryIdentifier>${xmlText(cfg.repositoryDomain)}</repositoryIdentifier>` +
      '<delimiter>:</delimiter>' +
      `<sampleIdentifier>${xmlText(this.oai.identifierFor(cfg, 'article-slug'))}</sampleIdentifier>` +
      '</oai-identifier>' +
      '</description>' +
      '</Identify>'
    );
  }

  private async listMetadataFormats(
    cfg: OaiConfig,
    query: Record<string, string | string[] | undefined>,
  ): Promise<string> {
    const identifier = single(query.identifier);
    if (identifier) {
      const slug = this.oai.slugFromIdentifier(cfg, identifier);
      const item = slug ? await this.oai.findItem(slug) : null;
      if (!item) {
        throw new OaiError('idDoesNotExist', 'Unknown identifier');
      }
    }
    return (
      '<ListMetadataFormats>' +
      '<metadataFormat>' +
      `<metadataPrefix>${METADATA_PREFIX}</metadataPrefix>` +
      '<schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>' +
      '<metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>' +
      '</metadataFormat>' +
      '</ListMetadataFormats>'
    );
  }

  private async listSets(): Promise<string> {
    const journals = await this.oai.listSets();
    if (journals.length === 0) {
      throw new OaiError('noSetHierarchy', 'No sets are defined');
    }
    const sets = journals
      .map(
        (j) =>
          '<set>' +
          `<setSpec>${xmlText(j.slug)}</setSpec>` +
          `<setName>${xmlText(j.titleEn)}</setName>` +
          `<setDescription><oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"` +
          ' xmlns:dc="http://purl.org/dc/elements/1.1/">' +
          `<dc:title>${xmlText(j.titleAr)}</dc:title>` +
          '</oai_dc:dc></setDescription>' +
          '</set>',
      )
      .join('');
    return `<ListSets>${sets}</ListSets>`;
  }

  private async listItems(
    verb: 'ListIdentifiers' | 'ListRecords',
    query: Record<string, string | string[] | undefined>,
    cfg: OaiConfig,
  ): Promise<string> {
    const token = single(query.resumptionToken);
    let offset = 0;
    let filters: OaiListFilters = {};

    if (token) {
      // resumptionToken is exclusive of every other argument.
      if (
        single(query.from) ||
        single(query.until) ||
        single(query.set) ||
        single(query.metadataPrefix)
      ) {
        throw new OaiError(
          'badArgument',
          'resumptionToken cannot be combined with other arguments',
        );
      }
      const state = decodeToken(token);
      offset = state.o;
      filters = {
        from: state.f ? parseOaiDate(state.f, 'from') : null,
        until: state.u ? parseOaiDate(state.u, 'until') : null,
        set: state.s ?? null,
      };
    } else {
      const prefix = single(query.metadataPrefix);
      if (!prefix) {
        throw new OaiError('badArgument', 'metadataPrefix is required');
      }
      if (prefix !== METADATA_PREFIX) {
        throw new OaiError(
          'cannotDisseminateFormat',
          `Unsupported metadataPrefix: ${prefix}`,
        );
      }
      filters = await this.parseFilters(query);
    }

    const { items, total } = await this.oai.listItems(filters, offset);
    if (items.length === 0) {
      throw new OaiError('noRecordsMatch', 'No records match the request');
    }

    const rendered = items
      .map((item) => this.renderOne(verb, item, cfg))
      .join('');

    const nextOffset = offset + items.length;
    const resumption =
      nextOffset < total
        ? resumptionTag(
            encodeToken({
              o: nextOffset,
              f: single(query.from) ?? undefined,
              u: single(query.until) ?? undefined,
              s: filters.set ?? undefined,
            }),
            total,
            offset,
          )
        : // An empty token closes the sequence for harvesters that were paging.
          offset > 0
          ? resumptionTag('', total, offset)
          : '';

    return `<${verb}>${rendered}${resumption}</${verb}>`;
  }

  private renderOne(
    verb: 'ListIdentifiers' | 'ListRecords',
    item: OaiItem,
    cfg: OaiConfig,
  ): string {
    const slug = item.submission.slug ?? '';
    const identifier = this.oai.identifierFor(cfg, slug);
    const datestamp = this.oai.datestampOf(item.submission);
    if (verb === 'ListIdentifiers') {
      return renderHeader(item, identifier, datestamp);
    }
    return renderRecord(
      item,
      identifier,
      datestamp,
      cfg,
      this.linksFor(cfg, item),
    );
  }

  private linksFor(cfg: OaiConfig, item: OaiItem): OaiRecordLinks {
    const slug = item.submission.slug ?? '';
    const journalSlug = item.submission.journal?.slug ?? null;
    return {
      articleUrl: this.oai.articleUrl(cfg, slug),
      journalUrl: journalSlug ? this.oai.journalUrl(cfg, journalSlug) : null,
    };
  }

  private async getRecord(
    query: Record<string, string | string[] | undefined>,
    cfg: OaiConfig,
  ): Promise<string> {
    const identifier = single(query.identifier);
    const prefix = single(query.metadataPrefix);
    if (!identifier || !prefix) {
      throw new OaiError(
        'badArgument',
        'identifier and metadataPrefix are both required',
      );
    }
    if (prefix !== METADATA_PREFIX) {
      throw new OaiError(
        'cannotDisseminateFormat',
        `Unsupported metadataPrefix: ${prefix}`,
      );
    }
    const slug = this.oai.slugFromIdentifier(cfg, identifier);
    const item = slug ? await this.oai.findItem(slug) : null;
    if (!item) {
      throw new OaiError('idDoesNotExist', 'Unknown identifier');
    }
    const record = renderRecord(
      item,
      this.oai.identifierFor(cfg, slug as string),
      this.oai.datestampOf(item.submission),
      cfg,
      this.linksFor(cfg, item),
    );
    return `<GetRecord>${record}</GetRecord>`;
  }

  private async parseFilters(
    query: Record<string, string | string[] | undefined>,
  ): Promise<OaiListFilters> {
    const fromRaw = single(query.from);
    const untilRaw = single(query.until);
    const set = single(query.set);

    const from = fromRaw ? parseOaiDate(fromRaw, 'from') : null;
    if (fromRaw && !from) {
      throw new OaiError('badArgument', 'Malformed from date');
    }
    const until = untilRaw ? parseOaiDate(untilRaw, 'until') : null;
    if (untilRaw && !until) {
      throw new OaiError('badArgument', 'Malformed until date');
    }
    if (
      fromRaw &&
      untilRaw &&
      granularityOf(fromRaw) !== granularityOf(untilRaw)
    ) {
      throw new OaiError(
        'badArgument',
        'from and until must use the same granularity',
      );
    }
    if (from && until && from > until) {
      throw new OaiError('badArgument', 'from must not be later than until');
    }
    if (set && !(await this.oai.setExists(set))) {
      // An unknown set is not an error in the protocol; it simply matches
      // nothing, and noRecordsMatch is the correct answer.
      throw new OaiError('noRecordsMatch', 'No records match the request');
    }

    return { from, until, set: set ?? null };
  }
}

function granularityOf(raw: string): 'day' | 'second' {
  return raw.length === 10 ? 'day' : 'second';
}

/** Express gives `string | string[]`; a repeated argument is a badArgument. */
function single(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    throw new OaiError('badArgument', 'Repeated argument');
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function assertNoUnknownArgs(
  verb: string,
  query: Record<string, unknown>,
): void {
  const allowed = ALLOWED_ARGS[verb] ?? [];
  for (const key of Object.keys(query)) {
    if (key === 'verb') continue;
    if (!allowed.includes(key)) {
      throw new OaiError('badArgument', `Unknown argument: ${key}`);
    }
  }
}

function resumptionTag(
  token: string,
  completeListSize: number,
  cursor: number,
): string {
  return (
    `<resumptionToken completeListSize="${completeListSize}" cursor="${cursor}">` +
    xmlText(token) +
    '</resumptionToken>'
  );
}

function requestTag(
  baseUrl: string,
  verb: string,
  query: Record<string, string | string[] | undefined>,
): string {
  const attrs: string[] = [];
  if (verb) attrs.push(`verb="${xmlText(verb)}"`);
  for (const key of ['identifier', 'metadataPrefix', 'from', 'until', 'set']) {
    const v = query[key];
    if (typeof v === 'string' && v.trim() !== '') {
      attrs.push(`${key}="${xmlText(v.trim())}"`);
    }
  }
  const suffix = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  return `<request${suffix}>${xmlText(baseUrl)}</request>`;
}

function envelope(body: string, requestTagXml: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    OAI_ENVELOPE_OPEN +
    `<responseDate>${oaiDatestamp(new Date())}</responseDate>` +
    requestTagXml +
    body +
    '</OAI-PMH>'
  );
}
