import { describe, expect, it } from 'vitest';
import { paginationSlots } from './pagination';

const numbers = (slots: ReturnType<typeof paginationSlots>) =>
  slots.filter((s): s is number => typeof s === 'number');

describe('paginationSlots', () => {
  it('lists every page when they all fit', () => {
    expect(paginationSlots(1, 5, 7)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationSlots(3, 7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('always keeps the first and last page reachable', () => {
    for (const page of [1, 5, 10, 50, 99, 100]) {
      const slots = paginationSlots(page, 100, 7);
      expect(slots[0]).toBe(1);
      expect(slots[slots.length - 1]).toBe(100);
    }
  });

  it('always includes the current page', () => {
    for (const page of [1, 2, 3, 42, 98, 99, 100]) {
      expect(numbers(paginationSlots(page, 100, 7))).toContain(page);
    }
  });

  it('never renders more slots than asked for', () => {
    for (let page = 1; page <= 30; page += 1) {
      expect(paginationSlots(page, 30, 7).length).toBeLessThanOrEqual(7);
      expect(paginationSlots(page, 30, 5).length).toBeLessThanOrEqual(5);
    }
  });

  it('opens a gap only where pages are actually skipped', () => {
    // Near the start there is nothing to skip on the left.
    expect(paginationSlots(1, 20, 7)).toEqual([1, 2, 3, 4, 'gap-end', 20]);
    // Near the end, nothing to skip on the right.
    expect(paginationSlots(20, 20, 7)).toEqual([1, 'gap-start', 17, 18, 19, 20]);
    // In the middle, both.
    expect(paginationSlots(10, 20, 7)).toEqual([
      1,
      'gap-start',
      9,
      10,
      11,
      'gap-end',
      20,
    ]);
  });

  it('keeps page numbers ascending and unique', () => {
    for (const page of [1, 4, 11, 19, 20]) {
      const ns = numbers(paginationSlots(page, 20, 7));
      expect([...ns].sort((a, b) => a - b)).toEqual(ns);
      expect(new Set(ns).size).toBe(ns.length);
    }
  });

  it('handles a single page and a two-page list', () => {
    expect(paginationSlots(1, 1, 7)).toEqual([1]);
    expect(paginationSlots(2, 2, 7)).toEqual([1, 2]);
  });

  it('copes with a small button budget', () => {
    const slots = paginationSlots(10, 20, 5);
    expect(slots.length).toBeLessThanOrEqual(5);
    expect(numbers(slots)).toContain(10);
    expect(slots[0]).toBe(1);
    expect(slots[slots.length - 1]).toBe(20);
  });
});
