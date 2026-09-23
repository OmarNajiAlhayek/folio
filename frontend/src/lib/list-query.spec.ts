import { describe, expect, it } from 'vitest';
import {
  createListQuery,
  pageCount,
  pageToOffset,
  paginate,
  parsePage,
} from './list-query';

const query = createListQuery({
  keys: ['q', 'status', 'year'] as const,
  enums: { status: ['open', 'closed'] },
  defaults: { status: 'open' },
});

describe('createListQuery', () => {
  it('round-trips every key through the query string', () => {
    const filters = { q: 'sensors', year: '2024' };
    const parsed = query.parse(query.toSearchParams(filters));
    expect(parsed).toEqual(filters);
  });

  it('ignores params it does not know about', () => {
    expect(query.parse(new URLSearchParams('q=a&injected=evil'))).toEqual({
      q: 'a',
    });
  });

  it('drops a value outside the allowed set', () => {
    // A hand-edited URL must not put an arbitrary value into a request.
    expect(query.parse(new URLSearchParams('status=deleted'))).toEqual({});
    expect(query.buildQuery({ status: 'deleted' })).toBe('');
  });

  it('keeps a value inside the allowed set', () => {
    expect(query.parse(new URLSearchParams('status=closed'))).toEqual({
      status: 'closed',
    });
  });

  it('omits a key sitting at its default', () => {
    expect(query.buildQuery({ status: 'open' })).toBe('');
    expect(query.parse(new URLSearchParams('status=open'))).toEqual({});
    expect(query.isActive({ status: 'open' })).toBe(false);
  });

  it('trims, and treats whitespace as absent', () => {
    expect(query.parse(new URLSearchParams('q=%20%20'))).toEqual({});
    expect(query.buildQuery({ q: '   ' })).toBe('');
    expect(query.parse(new URLSearchParams('q=%20a%20'))).toEqual({ q: 'a' });
  });

  it('reports which filters are active', () => {
    expect(query.activeKeys({ q: 'a', status: 'closed', year: '' })).toEqual([
      'q',
      'status',
    ]);
    expect(query.isActive({})).toBe(false);
    expect(query.isActive({ q: 'a' })).toBe(true);
  });

  it('emits keys in spec order, so the same filters make the same URL', () => {
    expect(query.buildQuery({ year: '2024', q: 'a' })).toBe('?q=a&year=2024');
  });

  it('returns an empty string rather than a bare question mark', () => {
    expect(query.buildQuery({})).toBe('');
  });
});

describe('parsePage', () => {
  it('defaults to the first page', () => {
    expect(parsePage(new URLSearchParams(''))).toBe(1);
  });

  it('reads a valid page', () => {
    expect(parsePage(new URLSearchParams('page=4'))).toBe(4);
  });

  it('falls back to page 1 rather than throwing on nonsense', () => {
    // A bad page in a shared link should show the first page, not an error.
    for (const bad of ['0', '-3', 'abc', '1.5e9999', '']) {
      expect(parsePage(new URLSearchParams(`page=${bad}`))).toBe(1);
    }
  });
});

describe('pageCount', () => {
  it('rounds up a partial last page', () => {
    expect(pageCount(41, 20)).toBe(3);
    expect(pageCount(40, 20)).toBe(2);
  });

  it('never reports zero pages, so the UI always has a page to show', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(-5, 20)).toBe(1);
    expect(pageCount(10, 0)).toBe(1);
  });
});

describe('pageToOffset', () => {
  it('maps a 1-based page to a 0-based offset', () => {
    expect(pageToOffset(1, 20)).toBe(0);
    expect(pageToOffset(3, 20)).toBe(40);
  });

  it('clamps a page below 1', () => {
    expect(pageToOffset(0, 20)).toBe(0);
    expect(pageToOffset(-2, 20)).toBe(0);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it('slices the page out of an in-memory list', () => {
    expect(paginate(items, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paginate(items, 3, 10)).toEqual([20, 21, 22, 23, 24]);
  });

  it('returns nothing past the end', () => {
    expect(paginate(items, 9, 10)).toEqual([]);
  });
});
