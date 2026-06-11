import {
  generateRequestId,
  isValidRequestId,
  normalizeRequestId,
} from './request-id';

describe('request-id', () => {
  it('generateRequestId returns a UUID v4', () => {
    const id = generateRequestId();
    expect(isValidRequestId(id)).toBe(true);
  });

  it('normalizeRequestId accepts valid UUID v4 and lowercases', () => {
    const raw = 'A1B2C3D4-E5F6-4789-ABCD-EF1234567890';
    expect(normalizeRequestId(raw)).toBe(raw.toLowerCase());
  });

  it('normalizeRequestId rejects arbitrary client strings', () => {
    const generated = normalizeRequestId('not-a-uuid; injection\n');
    expect(isValidRequestId(generated)).toBe(true);
    expect(generated).not.toBe('not-a-uuid; injection\n');
  });

  it('normalizeRequestId generates when missing', () => {
    expect(isValidRequestId(normalizeRequestId(undefined))).toBe(true);
  });
});
