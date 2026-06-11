'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import { apiBlob } from '@/lib/api';
import type { ConstructorFootnote } from '@/lib/constructor-content.types';
import { sanitizeConstructorTipTapHtml } from '@/lib/sanitize-constructor-html';

type FootnoteMaps = {
  footnoteNumById: Map<string, number>;
  endnoteNumById: Map<string, number>;
  footnotesById: Map<string, ConstructorFootnote>;
};

function buildFootnoteMaps(
  footnotes: ConstructorFootnote[] | undefined,
): FootnoteMaps {
  const footnotesById = new Map((footnotes ?? []).map((fn) => [fn.id, fn]));
  const footnoteNumById = new Map<string, number>();
  const endnoteNumById = new Map<string, number>();
  let footnoteNum = 0;
  let endnoteNum = 0;
  for (const fn of footnotes ?? []) {
    if (fn.placement === 'endnote') {
      endnoteNum += 1;
      endnoteNumById.set(fn.id, endnoteNum);
    } else {
      footnoteNum += 1;
      footnoteNumById.set(fn.id, footnoteNum);
    }
  }
  return { footnoteNumById, endnoteNumById, footnotesById };
}

function InlinePreviewImage({
  slug,
  fileId,
  alt,
}: {
  slug: string;
  fileId: string;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    const controller = new AbortController();
    apiBlob(`/submissions/${encodeURIComponent(slug)}/files/${fileId}`, {
      signal: controller.signal,
    })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [slug, fileId]);
  if (!src) {
    return (
      <span
        className="mx-0.5 inline-block h-8 min-w-[4rem] rounded border border-dashed border-ink/25 bg-paper/50 align-middle text-[10px] leading-8 text-ink/45"
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ''}
      className="mx-0.5 inline-block max-h-24 max-w-[12rem] align-middle"
    />
  );
}

function renderNode(
  node: Node,
  key: string,
  ctx: {
    slug?: string;
    maps: FootnoteMaps;
  },
): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map((child, i) =>
    renderNode(child, `${key}-${i}`, ctx),
  );

  if (tag === 'img') {
    const fileId = el.getAttribute('data-file-id')?.trim();
    if (fileId && ctx.slug) {
      return (
        <InlinePreviewImage
          key={key}
          slug={ctx.slug}
          fileId={fileId}
          alt={el.getAttribute('alt') ?? undefined}
        />
      );
    }
    return null;
  }

  if (tag === 'sup') {
    const footnoteId = el.getAttribute('data-footnote-id')?.trim();
    if (footnoteId) {
      const fn = ctx.maps.footnotesById.get(footnoteId);
      const num =
        fn?.placement === 'endnote'
          ? ctx.maps.endnoteNumById.get(footnoteId)
          : ctx.maps.footnoteNumById.get(footnoteId);
      if (num) {
        return (
          <sup key={key} className="text-[0.75em] text-accent">
            {fn?.placement === 'endnote' ? `${num}*` : num}
          </sup>
        );
      }
    }
  }

  const voidTags = new Set(['br']);
  if (voidTags.has(tag)) {
    return <br key={key} />;
  }

  if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href) {
      return (
        <a key={key} href={href} className="text-accent underline">
          {children}
        </a>
      );
    }
    return children;
  }

  const blockAndInline = new Set([
    'p',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'ul',
    'ol',
    'li',
    'span',
    'sub',
  ]);
  if (
    blockAndInline.has(tag) ||
    (tag === 'sup' && !el.getAttribute('data-footnote-id'))
  ) {
    const attrs: Record<string, string> = {};
    if (tag === 'span') {
      const dir = el.getAttribute('dir');
      if (dir === 'ltr' || dir === 'rtl') attrs.dir = dir;
    }
    return createElement(tag, { key, ...attrs }, ...children);
  }

  return children;
}

export function ConstructorRichHtmlPreview({
  html,
  slug,
  footnotes,
  dir,
  className,
  style,
}: {
  html: string;
  slug?: string;
  footnotes?: ConstructorFootnote[];
  dir?: 'ltr' | 'rtl';
  className?: string;
  style?: React.CSSProperties;
}) {
  const maps = useMemo(() => buildFootnoteMaps(footnotes), [footnotes]);
  const nodes = useMemo(() => {
    const safe = sanitizeConstructorTipTapHtml(html || '<p></p>');
    if (typeof document === 'undefined') return null;
    const doc = new DOMParser().parseFromString(safe, 'text/html');
    return Array.from(doc.body.childNodes).map((node, i) =>
      renderNode(node, `root-${i}`, { slug, maps }),
    );
  }, [html, slug, maps]);

  return (
    <div className={className} style={style} dir={dir}>
      {nodes}
    </div>
  );
}

export function PreviewFootnotesBlock({
  footnotes,
  style,
}: {
  footnotes: ConstructorFootnote[];
  style?: React.CSSProperties;
}) {
  const foot = footnotes.filter((fn) => fn.placement !== 'endnote');
  const end = footnotes.filter((fn) => fn.placement === 'endnote');
  if (foot.length === 0 && end.length === 0) return null;

  return (
    <section
      style={style}
      className="mt-6 border-t border-ink/15 pt-3 text-[10pt]"
    >
      {foot.map((fn, index) => {
        const footNum = index + 1;
        const plain = fn.text.replace(/<[^>]+>/g, '').trim();
        return (
          <p key={fn.id} className="my-1">
            <sup className="mr-1 text-accent">{footNum}</sup>
            {plain || '\u00a0'}
          </p>
        );
      })}
      {end.map((fn, index) => {
        const endNum = index + 1;
        const plain = fn.text.replace(/<[^>]+>/g, '').trim();
        return (
          <p key={fn.id} className="my-1 italic text-ink/80">
            <sup className="mr-1 text-accent">{endNum}*</sup>
            {plain || '\u00a0'}
          </p>
        );
      })}
    </section>
  );
}
