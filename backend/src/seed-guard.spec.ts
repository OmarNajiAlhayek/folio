import {
  assertSeedAllowed,
  describeSeedTarget,
  SeedNotAllowedError,
  type SeedEnv,
} from './seed-guard';

/** A plausible local dev machine — the only shape that may seed. */
const LOCAL: SeedEnv = {
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_PORT: '5434',
  DB_DATABASE: 'folio_review',
  APP_BASE_URL: 'http://localhost:5240',
};

describe('assertSeedAllowed', () => {
  it('allows a conventional local dev environment', () => {
    expect(() => assertSeedAllowed(LOCAL)).not.toThrow();
  });

  it('allows NODE_ENV=test so integration suites can seed', () => {
    expect(() =>
      assertSeedAllowed({ ...LOCAL, NODE_ENV: 'test' }),
    ).not.toThrow();
  });

  it('allows an empty environment (defaults to development/localhost)', () => {
    expect(() => assertSeedAllowed({})).not.toThrow();
  });

  describe('refuses anything that looks deployed', () => {
    const cases: Array<[string, SeedEnv]> = [
      ['NODE_ENV=production', { ...LOCAL, NODE_ENV: 'production' }],
      ['NODE_ENV=staging', { ...LOCAL, NODE_ENV: 'staging' }],
      ['strict runtime config', { ...LOCAL, RUNTIME_CONFIG_STRICT: 'true' }],
      ['secure auth cookies', { ...LOCAL, AUTH_COOKIE_SECURE: 'true' }],
      [
        'a public APP_BASE_URL',
        { ...LOCAL, APP_BASE_URL: 'https://journal.damascusuniversity.edu.sy' },
      ],
      ['a remote database', { ...LOCAL, DB_HOST: 'db.internal.example' }],
    ];

    it.each(cases)('%s', (_name, env) => {
      expect(() => assertSeedAllowed(env)).toThrow(SeedNotAllowedError);
    });
  });

  describe('destructive flags need an explicit confirmation', () => {
    it.each(['SEED_RESET_ALL', 'SEED_RESET_SAMPLE', 'SEED_RESET_DEMO'])(
      '%s alone is refused',
      (flag) => {
        expect(() => assertSeedAllowed({ ...LOCAL, [flag]: '1' })).toThrow(
          /FOLIO_ALLOW_DESTRUCTIVE_SEED/,
        );
      },
    );

    it('proceeds once FOLIO_ALLOW_DESTRUCTIVE_SEED=1 is set', () => {
      expect(() =>
        assertSeedAllowed({
          ...LOCAL,
          SEED_RESET_ALL: '1',
          FOLIO_ALLOW_DESTRUCTIVE_SEED: '1',
        }),
      ).not.toThrow();
    });

    it('still refuses a confirmed destructive run against a remote database', () => {
      // The confirmation gates data loss; it never unlocks a deployed target.
      expect(() =>
        assertSeedAllowed({
          ...LOCAL,
          DB_HOST: 'db.internal.example',
          SEED_RESET_ALL: '1',
          FOLIO_ALLOW_DESTRUCTIVE_SEED: '1',
        }),
      ).toThrow(/not a local database/);
    });
  });
});

describe('describeSeedTarget', () => {
  it('names host, port and database so the operator can check it', () => {
    expect(describeSeedTarget(LOCAL)).toBe('localhost:5434/folio_review');
  });

  it('falls back to the same defaults the datasource uses', () => {
    expect(describeSeedTarget({})).toBe('localhost:5432/folio_review');
  });
});
