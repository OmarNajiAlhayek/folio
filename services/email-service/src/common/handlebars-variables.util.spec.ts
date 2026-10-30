import { readFileSync } from 'fs';
import { join } from 'path';
import {
  collectHandlebarsVariables,
  findUnknownHandlebarsVariables,
} from './handlebars-variables.util';

describe('handlebars-variables.util', () => {
  it('collects simple mustache variables', () => {
    expect([
      ...collectHandlebarsVariables('Hello {{authorDisplayName}}'),
    ]).toEqual(['authorDisplayName']);
  });

  it('collects block helper condition variables', () => {
    expect([
      ...collectHandlebarsVariables('{{#if isOverdue}}x{{/if}}'),
    ]).toEqual(['isOverdue']);
  });

  it('collects partial hash variable references', () => {
    expect([
      ...collectHandlebarsVariables(
        '{{> folio-email-button href=submissionUrl label="Go"}}',
      ),
    ]).toEqual(['submissionUrl']);
  });

  it('treats the secondary button partial as a partial, not a variable', () => {
    expect([
      ...collectHandlebarsVariables(
        '{{> folio-email-button-secondary href=declineUrl label="Decline"}}',
      ),
    ]).toEqual(['declineUrl']);
  });

  it('ignores each-loop data variables', () => {
    expect([
      ...collectHandlebarsVariables(
        '{{#each items}}{{ @index }} {{ @key }}{{/each}}',
      ),
    ]).toEqual(['items']);
  });

  it('accepts the shipped reviewer invitation and decision templates', () => {
    const root = join(__dirname, '..', '..', 'templates');
    const invite = readFileSync(
      join(root, 'reviewer-invited.html.hbs'),
      'utf8',
    );
    const decision = readFileSync(
      join(root, 'submission-decision.html.hbs'),
      'utf8',
    );
    expect(
      findUnknownHandlebarsVariables(invite, [
        'reviewerDisplayName',
        'submissionTitle',
        'acceptUrl',
        'declineUrl',
      ]),
    ).toEqual([]);
    expect(
      findUnknownHandlebarsVariables(decision, [
        'authorDisplayName',
        'submissionTitle',
        'isAccepted',
        'isRejected',
        'isDeskReject',
        'isRevisionsRequested',
        'isMajorRevision',
        'hasReviewFiles',
        'reviewFileCount',
        'hasMessageForAuthor',
        'messageForAuthor',
        'decidedByDisplayName',
        'submissionUrl',
      ]),
    ).toEqual([]);
  });

  it('reports unknown variables', () => {
    expect(
      findUnknownHandlebarsVariables('{{initiatedByRole}}', [
        'authorDisplayName',
      ]),
    ).toEqual(['initiatedByRole']);
  });
});
