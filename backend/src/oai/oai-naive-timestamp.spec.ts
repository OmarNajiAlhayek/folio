import {
  instantToNaiveColumn,
  naiveColumnToInstant,
} from './oai-naive-timestamp';

/**
 * These assertions are written to hold in any server timezone, because that is
 * the whole point: the displacement being corrected is the server's own UTC
 * offset, so hard-coding a `+03:00` expectation would pass only in Damascus and
 * would tell us nothing in CI.
 */
describe('naiveColumnToInstant', () => {
  it('reads the local wall clock back as the UTC instant it stood for', () => {
    // What the driver produces for a stored `2026-09-08 13:33:30.612`.
    const asDriverParsedIt = new Date(2026, 8, 8, 13, 33, 30, 612);

    expect(naiveColumnToInstant(asDriverParsedIt).toISOString()).toBe(
      '2026-09-08T13:33:30.612Z',
    );
  });

  it('preserves whole-second precision used by OAI datestamps', () => {
    const d = new Date(2026, 0, 31, 0, 0, 0, 0);
    expect(naiveColumnToInstant(d).toISOString()).toBe(
      '2026-01-31T00:00:00.000Z',
    );
  });
});

describe('instantToNaiveColumn', () => {
  it('displaces an instant into the local clock the column compares against', () => {
    const instant = new Date('2026-09-08T13:33:30.612Z');
    const naive = instantToNaiveColumn(instant);

    expect(naive.getFullYear()).toBe(2026);
    expect(naive.getMonth()).toBe(8);
    expect(naive.getDate()).toBe(8);
    expect(naive.getHours()).toBe(13);
    expect(naive.getMinutes()).toBe(33);
    expect(naive.getSeconds()).toBe(30);
  });
});

describe('round trip', () => {
  it('is lossless in both directions', () => {
    const instant = new Date('2026-03-01T09:30:15.482Z');
    expect(
      naiveColumnToInstant(instantToNaiveColumn(instant)).toISOString(),
    ).toBe(instant.toISOString());
  });

  it('survives a date that crosses midnight under the local offset', () => {
    // The case a naive `getTimezoneOffset()` arithmetic fix gets wrong.
    const instant = new Date('2026-09-08T23:45:00.000Z');
    expect(
      naiveColumnToInstant(instantToNaiveColumn(instant)).toISOString(),
    ).toBe(instant.toISOString());
  });

  it('survives a date on the other side of a DST boundary', () => {
    const instant = new Date('2026-01-15T02:30:00.000Z');
    expect(
      naiveColumnToInstant(instantToNaiveColumn(instant)).toISOString(),
    ).toBe(instant.toISOString());
  });
});
