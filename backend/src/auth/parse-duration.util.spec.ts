import { parseDurationMs } from './parse-duration.util';

describe('parseDurationMs', () => {
  it('parses seconds, minutes, hours, and days', () => {
    expect(parseDurationMs('30s')).toBe(30_000);
    expect(parseDurationMs('15m')).toBe(15 * 60_000);
    expect(parseDurationMs('1h')).toBe(60 * 60_000);
    expect(parseDurationMs('7d')).toBe(7 * 24 * 60 * 60_000);
  });

  it('rejects invalid values', () => {
    expect(() => parseDurationMs('bad')).toThrow(/Invalid duration/);
  });
});
