import { describe, expect, it } from 'vitest';
import { formatMediumDate } from './format-date';

/** 23:30 UTC on 12 March — already 13 March everywhere east of UTC+1. */
const LATE_ON_THE_TWELFTH = '2026-03-12T23:30:00.000Z';

describe('formatMediumDate', () => {
  it('formats a publication date in UTC, not the runtime zone', () => {
    expect(formatMediumDate(LATE_ON_THE_TWELFTH, 'en')).toBe('Mar 12, 2026');
  });

  it('does not drift to the reader-local day', () => {
    const damascus = new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeZone: 'Asia/Damascus',
    }).format(new Date(LATE_ON_THE_TWELFTH));
    expect(damascus).toBe('Mar 13, 2026');
    expect(formatMediumDate(LATE_ON_THE_TWELFTH, 'en')).not.toBe(damascus);
  });

  it('agrees with the citation_publication_date the same instant produces', () => {
    const d = new Date(LATE_ON_THE_TWELFTH);
    const scholarDay = String(d.getUTCDate()).padStart(2, '0');
    expect(formatMediumDate(LATE_ON_THE_TWELFTH, 'en')).toContain(
      String(Number(scholarDay)),
    );
  });

  it('renders Arabic locales in UTC too', () => {
    const ar = formatMediumDate(LATE_ON_THE_TWELFTH, 'ar');
    expect(ar).not.toBe('');
    expect(ar).toBe(
      new Intl.DateTimeFormat('ar', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(new Date(LATE_ON_THE_TWELFTH)),
    );
  });

  it('returns an empty string for a missing date', () => {
    expect(formatMediumDate(null, 'en')).toBe('');
    expect(formatMediumDate(undefined, 'en')).toBe('');
  });
});
