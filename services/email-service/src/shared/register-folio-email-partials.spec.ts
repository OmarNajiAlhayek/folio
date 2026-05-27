import * as Handlebars from 'handlebars';
import {
  registerFolioEmailPartials,
  resetFolioEmailPartialsForTests,
} from './register-folio-email-partials';

describe('registerFolioEmailPartials', () => {
  afterEach(() => {
    resetFolioEmailPartialsForTests();
  });

  it('renders layout partial with block content', () => {
    registerFolioEmailPartials();
    const tpl = Handlebars.compile(
      `{{#> folio-email-layout dir="ltr" lang="en"}}<p>Hello</p>{{/folio-email-layout}}`,
    );
    const html = tpl({});
    expect(html).toContain('data-folio-email="1"');
    expect(html).toContain('Hello');
    expect(html).toContain('dir="ltr"');
  });

  it('renders primary button partial', () => {
    registerFolioEmailPartials();
    const tpl = Handlebars.compile(
      `{{#> folio-email-layout dir="ltr" lang="en"}}{{> folio-email-button href="https://example.org" label="Go" align="left"}}{{/folio-email-layout}}`,
    );
    const html = tpl({});
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('bgcolor="#c45c3e"');
  });
});
