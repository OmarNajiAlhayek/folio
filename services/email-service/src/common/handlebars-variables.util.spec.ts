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

  it('ignores each-loop data variables', () => {
    expect([
      ...collectHandlebarsVariables(
        '{{#each items}}{{ @index }} {{ @key }}{{/each}}',
      ),
    ]).toEqual(['items']);
  });

  it('reports unknown variables', () => {
    expect(
      findUnknownHandlebarsVariables('{{initiatedByRole}}', [
        'authorDisplayName',
      ]),
    ).toEqual(['initiatedByRole']);
  });
});
