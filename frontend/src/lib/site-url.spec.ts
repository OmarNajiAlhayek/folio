import {
  absoluteLocaleUrl,
  absoluteUrl,
  getSiteUrl,
  localeAlternates,
  localePath,
} from './site-url';

const ORIGINAL = process.env.PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = ORIGINAL;
});

function setSite(value: string | undefined) {
  if (value === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = value;
}

describe('getSiteUrl', () => {
  it('returns null when unset, so callers fail closed', () => {
    setSite(undefined);
    expect(getSiteUrl()).toBeNull();
  });

  it('treats a blank value as unset', () => {
    setSite('   ');
    expect(getSiteUrl()).toBeNull();
  });

  it('rejects a value that is not an absolute URL', () => {
    setSite('journals.example.edu');
    expect(getSiteUrl()).toBeNull();
  });

  it('strips trailing slashes so joins never double up', () => {
    setSite('https://journals.example.edu///');
    expect(getSiteUrl()).toBe('https://journals.example.edu');
  });
});

describe('absoluteUrl', () => {
  it('is null while unconfigured', () => {
    setSite(undefined);
    expect(absoluteUrl('/publications')).toBeNull();
  });

  it('joins a path with or without a leading slash', () => {
    setSite('https://journals.example.edu');
    expect(absoluteUrl('/publications')).toBe(
      'https://journals.example.edu/publications',
    );
    expect(absoluteUrl('publications')).toBe(
      'https://journals.example.edu/publications',
    );
  });
});

describe('localePath', () => {
  it('prefixes the locale', () => {
    expect(localePath('ar', '/journals/engj')).toBe('/ar/journals/engj');
  });

  it('renders the site root as just the locale', () => {
    expect(localePath('en', '/')).toBe('/en');
  });
});

describe('absoluteLocaleUrl', () => {
  it('builds a locale-prefixed absolute URL', () => {
    setSite('https://journals.example.edu');
    expect(absoluteLocaleUrl('ar', '/publications/a-study')).toBe(
      'https://journals.example.edu/ar/publications/a-study',
    );
  });
});

describe('localeAlternates', () => {
  it('returns one absolute URL per configured locale', () => {
    setSite('https://journals.example.edu');
    expect(localeAlternates('/publications/a-study')).toEqual({
      en: 'https://journals.example.edu/en/publications/a-study',
      ar: 'https://journals.example.edu/ar/publications/a-study',
    });
  });

  it('is empty while unconfigured, because a relative hreflang resolves wrong', () => {
    setSite(undefined);
    expect(localeAlternates('/publications/a-study')).toEqual({});
  });
});
