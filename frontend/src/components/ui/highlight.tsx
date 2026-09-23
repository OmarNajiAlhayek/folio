import { Fragment, type ElementType } from 'react';
import { highlightSegments } from '@folio/shared/text/search-normalize';
import { cn } from '@/lib/utils';

type HighlightProps = {
  /** The text to display, exactly as it should read. */
  text: string;
  /** The raw search query. Folded before matching, so spelling variants still mark. */
  query?: string;
  /** Element to wrap the result in. Defaults to a `<span>`. */
  as?: ElementType;
  className?: string;
  /** Match whole tokens instead of prefixes. */
  exact?: boolean;
};

/**
 * Renders `text`, wrapping the parts that `query` matches in `<mark>`.
 *
 * Matching is Arabic-aware: it ignores harakat, tatweel, hamza carriers,
 * ta-marbuta and the definite article, so searching `هندسه` marks `الهندسة`.
 * The displayed text is never rewritten — `highlightSegments` works in offsets
 * into the original string, so what is marked is exactly what was there.
 */
export function Highlight({
  text,
  query,
  as: Tag = 'span',
  className,
  exact = false,
}: HighlightProps) {
  if (!query?.trim() || !text) {
    return <Tag className={className}>{text}</Tag>;
  }

  const segments = highlightSegments(text, query, { prefix: !exact });
  const hasMatch = segments.some((segment) => segment.match);
  if (!hasMatch) {
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <Tag className={className}>
      {segments.map((segment, i) =>
        segment.match ? (
          <mark
            // Segments are positional and the list is re-derived on every render.
            key={i}
            className={cn(
              'rounded-[3px] bg-accent/18 px-0.5 text-inherit',
              'dark:bg-accent/30',
            )}
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </Tag>
  );
}
