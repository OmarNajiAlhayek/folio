import { generateEntityId } from './entity-id';

const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('entity-id', () => {
  it('generateEntityId returns a UUID v7', () => {
    const id = generateEntityId();
    expect(UUID_V7_RE.test(id)).toBe(true);
  });

  it('generateEntityId returns unique values', () => {
    const a = generateEntityId();
    const b = generateEntityId();
    expect(a).not.toBe(b);
  });
});
