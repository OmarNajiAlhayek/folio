'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Options = {
  /** Number of nav items currently permitted for this user. */
  itemCount: number;
  /** Re-measure when this changes (labels differ per locale). */
  locale: string;
};

type NavOverflow = {
  /** The flexible nav region. Must be `flex-1 min-w-0 overflow-hidden`. */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Hidden, never-clipped copy of the full row: every item followed by the "More" trigger.
   * Must be absolutely positioned with `w-max` so children keep their natural width.
   */
  ghostRef: React.RefObject<HTMLDivElement | null>;
  /** How many leading items fit. The rest belong in the overflow menu. */
  visibleCount: number;
};

/**
 * "Priority+" navigation: keep the header on one row by moving whatever does not fit into a
 * "More" menu.
 *
 * Widths are read from a hidden ghost row rather than from the visible row. That matters: if you
 * measure the visible row, hiding an item shrinks the measured content, which makes it look like
 * more items fit, which un-hides them, which overflows again — the classic flickering navbar.
 * Measuring an off-flow copy that is never clipped makes `visibleCount` a pure function of the
 * available width, so it cannot feed back into itself.
 *
 * The container must be `flex-1 min-w-0 overflow-hidden` for the same reason: its width is then
 * fixed by the surrounding flex layout and never by its own content.
 */
export function useNavOverflow({ itemCount, locale }: Options): NavOverflow {
  const containerRef = useRef<HTMLElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const ghost = ghostRef.current;
    if (!container || !ghost) return;

    const available = container.clientWidth;
    // Hidden below the desktop breakpoint: nothing meaningful to measure.
    if (available === 0) return;

    const children = Array.from(ghost.children) as HTMLElement[];
    if (children.length === 0) return;

    // Ghost layout is `[...items, moreTrigger]`.
    const moreWidth =
      children[children.length - 1].getBoundingClientRect().width;
    const widths = children
      .slice(0, -1)
      .map((el) => el.getBoundingClientRect().width);

    // Read the gap instead of deriving it from offsets: `offsetLeft` runs the other way in RTL.
    const gap = Number.parseFloat(getComputedStyle(ghost).columnGap) || 0;

    const totalWidth =
      widths.reduce((sum, w) => sum + w, 0) +
      Math.max(0, widths.length - 1) * gap;

    if (totalWidth <= available) {
      setVisibleCount(widths.length);
      return;
    }

    const budget = available - moreWidth - gap;
    let used = 0;
    let fits = 0;
    for (const width of widths) {
      const next = used + (fits > 0 ? gap : 0) + width;
      if (next > budget) break;
      used = next;
      fits += 1;
    }
    setVisibleCount(fits);
  }, []);

  useEffect(() => {
    measure();

    const observer = new ResizeObserver(() => measure());
    if (containerRef.current) observer.observe(containerRef.current);
    // Observing the ghost covers the `useMe()` hydration expansion, locale label changes and
    // webfont swaps — all of them resize the ghost without resizing the container.
    if (ghostRef.current) observer.observe(ghostRef.current);

    // `html[dir='rtl']` swaps in Noto Sans Arabic / Amiri, which changes every label's width.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [measure, itemCount, locale]);

  return { containerRef, ghostRef, visibleCount };
}
