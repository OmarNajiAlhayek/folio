'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { resolveSectionDir } from '@/lib/constructor-direction';
import {
  detectArticleDir,
  layoutPreviewSections,
  previewCaption,
} from '@/lib/constructor-preview-layout';
import {
  referenceEntrySortKey,
  resolveReferenceEntryHtml,
} from '@/lib/constructor-rich-text';
import {
  sanitizeConstructorTipTapHtml,
  sanitizeKatexPreviewHtml,
} from '@/lib/sanitize-constructor-html';
import { apiBlob } from '@/lib/api';
import { parseKeywordsFromStorage } from '@/lib/keywords';
import { KeywordTagsDisplay } from '@/components/ui/keyword-tags-input';
import {
  ConstructorRichHtmlPreview,
  PreviewFootnotesBlock,
} from '@/components/constructor/ConstructorRichHtmlPreview';
import {
  getTableCellText,
  isTableCellCovered,
  normalizeTableRows,
} from '@/lib/constructor-table-utils';
import type {
  CitationStyle,
  ManuscriptPreviewTheme,
} from '@/lib/manuscript-styles-catalog';
import type {
  AbstractSection,
  AuthorsSection,
  ConstructorContent,
  ConstructorDir,
  ConstructorSection,
  HeadingSection,
  ImageSection,
  ParagraphSection,
  ReferencesSection,
  EquationSection,
  RichTextBlockSection,
  TableSection,
  TitleSection,
} from '@/lib/constructor-content.types';

interface LivePreviewProps {
  content: ConstructorContent;
  /** Theme from `GET /public/manuscript-styles` for the effective profile id. */
  previewTheme: ManuscriptPreviewTheme;
  /** Journal's style; `vancouver` keeps the author's reference order. Unknown → APA. */
  citationStyle?: CitationStyle | null;
  /** Required to render image previews via the protected files endpoint. */
  slug?: string;
  debounceMs?: number;
}

/**
 * Side-by-side approximation of the generated `.docx`. Driven by the catalog
 * `previewTheme` for fonts and house conventions; Word layout is not identical to CSS.
 */
export function LivePreview({
  content,
  previewTheme,
  citationStyle = null,
  slug,
  debounceMs = 300,
}: LivePreviewProps) {
  const t = useTranslations('ConstructorPreview');

  const [debouncedContent, setDebouncedContent] = useState(content);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedContent(content), debounceMs);
    return () => clearTimeout(handle);
  }, [content, debounceMs]);

  const numbering = useMemo(() => {
    const map = new Map<string, number>();
    let figure = 0;
    let table = 0;
    let equation = 0;
    for (const s of debouncedContent.sections) {
      if (s.kind === 'image') {
        figure += 1;
        map.set(s.id, figure);
      } else if (s.kind === 'table') {
        table += 1;
        map.set(s.id, table);
      } else if (s.kind === 'equation') {
        equation += 1;
        map.set(s.id, equation);
      }
    }
    return map;
  }, [debouncedContent.sections]);

  const defaultDir = content.defaultDir;
  const articleDir = useMemo(() => detectArticleDir(content), [content]);
  const layout = useMemo(
    () =>
      layoutPreviewSections(
        content,
        previewTheme.bilingualFrontMatter ?? false,
      ),
    [content, previewTheme.bilingualFrontMatter],
  );
  const rootFont =
    articleDir === 'rtl'
      ? previewTheme.fontFamilyArabicStack
      : previewTheme.fontFamilyLatinStack;

  return (
    <aside
      className="rounded-2xl border border-ink/10 bg-surface/50 p-4 shadow-sm backdrop-blur-[2px] transition hover:border-ink/15 hover:shadow-md flex flex-col justify-stretch min-h-[600px]"
      aria-label={t('ariaLabel')}
    >
      <header className="border-b border-ink/10 pb-3 mb-4 text-xs font-medium uppercase tracking-wide text-ink/60">
        <div className="flex items-center gap-1.5 text-ink font-extrabold text-sm">
          <Eye className="size-4 text-accent" strokeWidth={2.5} aria-hidden />
          {t('header')}
        </div>
        <p className="mt-1 normal-case font-normal text-ink/50 text-[10px] tracking-normal leading-relaxed">
          {t('approximateNotice')}
        </p>
      </header>

      {/* Simulated physical publication paper layout canvas */}
      <div className="bg-neutral-100/50 dark:bg-neutral-950/40 rounded-xl p-4 md:p-6 border border-ink/5 flex-1 flex flex-col justify-stretch">
        {content.sections.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 px-4 text-center select-none animate-pulse">
            <div className="flex flex-col items-center">
              <div className="rounded-2xl bg-accent/5 dark:bg-accent/10 p-4 text-accent mb-4 border border-accent/10 shadow-xs">
                <FileText className="size-8" strokeWidth={1.5} aria-hidden />
              </div>
              <h3 className="text-sm font-extrabold text-ink/80 mb-1">
                No sections committed yet
              </h3>
              <p className="text-xs text-ink/45 max-w-xs leading-relaxed">
                {t('empty')}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 md:p-8 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.03),0_10px_15px_-3px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.25),0_10px_15px_-3px_rgba(0,0,0,0.3)] transition-all duration-300 select-text"
            style={{
              fontFamily: rootFont,
            }}
            dir={articleDir}
          >
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {layout.map((item) => (
                <div
                  key={item.key}
                  data-testid={`constructor-preview-section-${item.key}`}
                  className="transition-all duration-300 animate-fade-in mb-4 last:mb-0"
                >
                  {item.pageBreakBefore ? (
                    <hr
                      aria-hidden
                      className="my-6 border-0 border-t border-dashed border-ink/20"
                    />
                  ) : null}
                  <PreviewSection
                    section={item.section}
                    defaultDir={defaultDir}
                    articleDir={articleDir}
                    frontMatterLang={item.lang}
                    slug={slug}
                    footnotes={debouncedContent.footnotes}
                    figureOrTableNumber={numbering.get(item.section.id)}
                    previewTheme={previewTheme}
                    citationStyle={citationStyle}
                  />
                </div>
              ))}
              {debouncedContent.footnotes?.length ? (
                <PreviewFootnotesBlock
                  footnotes={debouncedContent.footnotes}
                  style={{ fontFamily: rootFont }}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function PreviewSection({
  section,
  defaultDir,
  articleDir,
  frontMatterLang,
  slug,
  footnotes,
  figureOrTableNumber,
  previewTheme,
  citationStyle,
}: {
  section: ConstructorSection;
  defaultDir: ConstructorDir;
  articleDir: ConstructorDir;
  /** Language page of a front-matter block; its direction follows the page. */
  frontMatterLang?: 'ar' | 'en';
  slug?: string;
  footnotes?: ConstructorContent['footnotes'];
  figureOrTableNumber?: number;
  previewTheme: ManuscriptPreviewTheme;
  citationStyle: CitationStyle | null;
}) {
  const dir: ConstructorDir = frontMatterLang
    ? frontMatterLang === 'ar'
      ? 'rtl'
      : 'ltr'
    : resolveSectionDir(section, defaultDir);
  const fontFamily =
    dir === 'rtl'
      ? previewTheme.fontFamilyArabicStack
      : previewTheme.fontFamilyLatinStack;

  const wrapperStyle = { fontFamily };

  switch (section.kind) {
    case 'title':
      return <PreviewTitle section={section} dir={dir} style={wrapperStyle} />;
    case 'authors':
      return (
        <PreviewAuthors section={section} dir={dir} style={wrapperStyle} />
      );
    case 'abstract':
      return <PreviewAbstract section={section} previewTheme={previewTheme} />;
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return (
        <PreviewHeading section={section} dir={dir} style={wrapperStyle} />
      );
    case 'paragraph':
      return (
        <PreviewParagraph
          section={section}
          dir={dir}
          style={wrapperStyle}
          slug={slug}
          footnotes={footnotes}
        />
      );
    case 'image':
      return (
        <PreviewImage
          section={section}
          dir={dir}
          style={wrapperStyle}
          slug={slug}
          number={figureOrTableNumber ?? 0}
          previewTheme={previewTheme}
        />
      );
    case 'table':
      return (
        <PreviewTable
          section={section}
          dir={dir}
          style={wrapperStyle}
          number={figureOrTableNumber ?? 0}
          previewTheme={previewTheme}
        />
      );
    case 'acknowledgments':
    case 'funding':
    case 'conflictOfInterest':
    case 'dataAvailability':
      return (
        <PreviewRichTextBlock
          section={section as RichTextBlockSection}
          dir={dir}
          style={wrapperStyle}
          slug={slug}
          footnotes={footnotes}
        />
      );
    case 'equation':
      return (
        <PreviewEquation section={section} number={figureOrTableNumber ?? 0} />
      );
    case 'references':
      return (
        <PreviewReferences
          section={section}
          articleDir={articleDir}
          previewTheme={previewTheme}
          citationStyle={citationStyle}
        />
      );
  }
}

function PreviewTitle({
  section,
  dir,
  style,
}: {
  section: TitleSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
}) {
  return (
    <h1
      dir={dir}
      style={{
        ...style,
        fontSize: '16pt',
        fontWeight: 700,
        textAlign: 'start',
        margin: '0 0 0.75rem',
      }}
    >
      {section.text || '\u00a0'}
    </h1>
  );
}

function PreviewAuthors({
  section,
  dir,
  style,
}: {
  section: AuthorsSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
}) {
  const people = section.authors.filter((a) => a.fullName.trim());
  if (people.length === 0) {
    return null;
  }
  const separator = dir === 'rtl' ? '، ' : ', ';
  const fontSize = dir === 'rtl' ? '12pt' : '11pt';
  // Template: "د. الاسم الكنية¹*، أ.د. …", then one affiliation line per author.
  return (
    <div dir={dir} style={{ ...style, marginBottom: '1rem', fontSize }}>
      <p style={{ margin: '0 0 0.25rem' }}>
        {people.map((a, i) => (
          <span key={i}>
            {[a.title?.trim(), a.fullName.trim()].filter(Boolean).join(' ')}
            <sup>
              {i + 1}
              {a.isCorresponding ? '*' : ''}
            </sup>
            {i < people.length - 1 ? separator : ''}
          </span>
        ))}
      </p>
      {people.map((a, i) => (
        <p key={i} style={{ margin: 0 }}>
          <sup>{i + 1}</sup>{' '}
          {[a.affiliation, a.specialization, a.email]
            .map((part) => part?.trim())
            .filter(Boolean)
            .join(separator)}
        </p>
      ))}
    </div>
  );
}

function PreviewAbstract({
  section,
  previewTheme,
}: {
  section: AbstractSection;
  previewTheme: ManuscriptPreviewTheme;
}) {
  const dir: ConstructorDir = section.lang === 'ar' ? 'rtl' : 'ltr';
  const fontFamily =
    dir === 'rtl'
      ? previewTheme.fontFamilyArabicStack
      : previewTheme.fontFamilyLatinStack;
  const keywordTags = parseKeywordsFromStorage(section.keywords);
  return (
    <section dir={dir} style={{ fontFamily, marginBottom: '1rem' }}>
      <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: '0 0 0.25rem' }}>
        {section.lang === 'ar' ? 'الملخص:' : 'Abstract:'}
      </h2>
      <p
        style={{
          fontSize: dir === 'rtl' ? '12pt' : '11pt',
          margin: '0 0 0.5rem',
        }}
      >
        {section.text || '\u00a0'}
      </p>
      {keywordTags.length > 0 ? (
        <p
          style={{
            fontSize: dir === 'rtl' ? '12pt' : '11pt',
            margin: 0,
            fontStyle: 'italic',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: '0.35rem',
          }}
        >
          <strong>
            {section.lang === 'ar' ? 'الكلمات المفتاحية: ' : 'Keywords: '}
          </strong>
          <KeywordTagsDisplay tags={keywordTags} />
        </p>
      ) : null}
    </section>
  );
}

function PreviewHeading({
  section,
  dir,
  style,
}: {
  section: HeadingSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
}) {
  // Every subheading is 14 pt bold in the template; the level only sets the outline.
  const Tag =
    section.kind === 'heading1'
      ? 'h2'
      : section.kind === 'heading2'
        ? 'h3'
        : 'h4';
  return (
    <Tag
      dir={dir}
      style={{
        ...style,
        fontSize: '14pt',
        fontWeight: 700,
        margin: '0.75rem 0 0.5rem',
      }}
    >
      {section.text || '\u00a0'}
    </Tag>
  );
}

function PreviewParagraph({
  section,
  dir,
  style,
  slug,
  footnotes,
}: {
  section: ParagraphSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
  slug?: string;
  footnotes?: ConstructorContent['footnotes'];
}) {
  return (
    <ConstructorRichHtmlPreview
      html={section.html || '<p></p>'}
      slug={slug}
      footnotes={footnotes}
      dir={dir}
      className="constructor-preview-html"
      style={{
        ...style,
        fontSize: dir === 'rtl' ? '12pt' : '11pt',
        lineHeight: 1.4,
        margin: '0 0 0.5rem',
      }}
    />
  );
}

function PreviewImage({
  section,
  dir,
  style,
  slug,
  number,
  previewTheme,
}: {
  section: ImageSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
  slug?: string;
  number: number;
  previewTheme: ManuscriptPreviewTheme;
}) {
  const captionBlock = (
    <figcaption
      style={{
        fontSize: '10pt',
        fontWeight: 700,
        marginTop: previewTheme.figureCaptionBelowImage ? '0.25rem' : 0,
        marginBottom: previewTheme.figureCaptionBelowImage ? 0 : '0.25rem',
      }}
    >
      {previewCaption(
        { rtl: previewTheme.figureWord, ltr: previewTheme.figureWordLtr },
        previewTheme.captionNumberFormat,
        number,
        section.caption,
        dir,
      )}
    </figcaption>
  );

  const imgBlock =
    section.fileId && slug ? (
      <ProtectedImage
        slug={slug}
        fileId={section.fileId}
        alt={section.altText}
      />
    ) : (
      <div
        aria-hidden
        className="mx-auto flex h-32 w-full max-w-md items-center justify-center rounded border border-dashed border-ink/20 bg-paper/40 text-xs text-ink/45"
      >
        {section.altText || '(no image)'}
      </div>
    );

  return (
    <figure
      dir={dir}
      style={{ ...style, margin: '0.75rem 0', textAlign: 'center' }}
    >
      {previewTheme.figureCaptionBelowImage ? (
        <>
          {imgBlock}
          {captionBlock}
        </>
      ) : (
        <>
          {captionBlock}
          {imgBlock}
        </>
      )}
    </figure>
  );
}

function ProtectedImage({
  slug,
  fileId,
  alt,
}: {
  slug: string;
  fileId: string;
  alt: string;
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
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{ maxWidth: '100%', maxHeight: '16rem', display: 'inline-block' }}
    />
  );
}

function PreviewTable({
  section,
  dir,
  style,
  number,
  previewTheme,
}: {
  section: TableSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
  number: number;
  previewTheme: ManuscriptPreviewTheme;
}) {
  const captionEl = (
    <p
      style={{
        fontSize: '10pt',
        fontWeight: 700,
        textAlign: 'center',
        margin: previewTheme.tableCaptionAboveTable
          ? '0 0 0.25rem'
          : '0.25rem 0 0',
      }}
    >
      {previewCaption(
        { rtl: previewTheme.tableWord, ltr: previewTheme.tableWordLtr },
        previewTheme.captionNumberFormat,
        number,
        section.caption,
        dir,
      )}
    </p>
  );

  // Template tables: heavy rules above and below, thin rules between rows, no verticals.
  const ruled = previewTheme.tableBorders === 'horizontalRules';
  const normalizedRows = normalizeTableRows(section.rows);
  const tableEl = (
    <table
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        fontSize: '10pt',
        ...(ruled
          ? { borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000' }
          : {}),
      }}
    >
      <tbody>
        {normalizedRows.map((row, r) => (
          <tr
            key={r}
            style={
              ruled && r < normalizedRows.length - 1
                ? { borderBottom: '1px solid #000' }
                : undefined
            }
          >
            {row.map((cell, c) => {
              if (isTableCellCovered(cell)) return null;
              const isHeader = section.hasHeaderRow && r === 0;
              const Tag = isHeader ? 'th' : 'td';
              const rowSpan = cell.rowSpan ?? 1;
              const colSpan = cell.colSpan ?? 1;
              return (
                <Tag
                  key={c}
                  rowSpan={rowSpan > 1 ? rowSpan : undefined}
                  colSpan={colSpan > 1 ? colSpan : undefined}
                  style={{
                    border: ruled ? 'none' : '1px solid #999',
                    padding: '4px 8px',
                    fontWeight: isHeader ? 700 : 400,
                    textAlign: 'start',
                  }}
                >
                  {getTableCellText(cell) || '\u00a0'}
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div dir={dir} style={{ ...style, margin: '0.75rem 0' }}>
      {previewTheme.tableCaptionAboveTable ? (
        <>
          {captionEl}
          {tableEl}
        </>
      ) : (
        <>
          {tableEl}
          {captionEl}
        </>
      )}
      {section.notes?.trim() ? (
        <p
          dir={dir}
          style={{
            fontSize: '10pt',
            marginTop: '0.35rem',
            textAlign: dir === 'rtl' ? 'right' : 'left',
          }}
        >
          {section.notes}
        </p>
      ) : null}
    </div>
  );
}

function PreviewRichTextBlock({
  section,
  dir,
  style,
  slug,
  footnotes,
}: {
  section: RichTextBlockSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
  slug?: string;
  footnotes?: ConstructorContent['footnotes'];
}) {
  return (
    <ConstructorRichHtmlPreview
      html={section.html || '<p></p>'}
      slug={slug}
      footnotes={footnotes}
      dir={dir}
      className="constructor-preview-html"
      style={{ ...style, margin: '0.75rem 0', fontSize: '11pt' }}
    />
  );
}

function PreviewEquation({
  section,
  number,
}: {
  section: EquationSection;
  number: number;
}) {
  const t = useTranslations('ConstructorPreview');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const latex = section.latex.trim();
      if (!latex) {
        setPreviewHtml(null);
        setPreviewError(false);
        return;
      }
      try {
        const katex = await import('katex');
        await import('katex/dist/katex.min.css');
        const html = katex.default.renderToString(latex, {
          throwOnError: true,
          displayMode: true,
        });
        if (!cancelled) {
          setPreviewHtml(html);
          setPreviewError(false);
        }
      } catch {
        if (!cancelled) {
          setPreviewHtml(null);
          setPreviewError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section.latex]);

  const label = section.numbered && number > 0 ? ` (${number})` : '';

  return (
    <div style={{ margin: '0.75rem 0', textAlign: 'center' }}>
      {previewError ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {t('equationPreviewError')}
        </p>
      ) : previewHtml ? (
        <div
          className="katex-preview overflow-x-auto"
          dangerouslySetInnerHTML={{
            __html: sanitizeKatexPreviewHtml(previewHtml),
          }}
        />
      ) : section.latex.trim() ? null : (
        <span className="text-ink/45">{t('equationEmpty')}</span>
      )}
      {label ? <span>{label}</span> : null}
    </div>
  );
}

function PreviewReferences({
  section,
  articleDir,
  previewTheme,
  citationStyle,
}: {
  section: ReferencesSection;
  articleDir: ConstructorDir;
  previewTheme: ManuscriptPreviewTheme;
  citationStyle: CitationStyle | null;
}) {
  const vancouver = citationStyle === 'vancouver';
  const sorted = useMemo(() => {
    // Vancouver: [n] in the text point at list positions — keep the author's order.
    if (vancouver) return section.items;
    const ar = section.items
      .filter((i) => i.lang === 'ar')
      .slice()
      .sort((a, b) =>
        referenceEntrySortKey(a).localeCompare(referenceEntrySortKey(b), 'ar'),
      );
    const en = section.items
      .filter((i) => i.lang === 'en')
      .slice()
      .sort((a, b) =>
        referenceEntrySortKey(a).localeCompare(referenceEntrySortKey(b), 'en'),
      );
    return previewTheme.referencesArabicFirst ? [...ar, ...en] : [...en, ...ar];
  }, [section.items, previewTheme.referencesArabicFirst, vancouver]);

  const heading =
    articleDir === 'ltr'
      ? (previewTheme.referencesHeadingLtr ?? previewTheme.referencesHeading)
      : previewTheme.referencesHeading;
  const numbered = vancouver || (previewTheme.referencesNumbered ?? true);

  return (
    <section dir={articleDir} style={{ margin: '1rem 0 0' }}>
      <h2
        style={{
          fontSize: '14pt',
          fontWeight: 700,
          margin: '0 0 0.5rem',
        }}
      >
        {heading}
      </h2>
      <ol
        style={{
          paddingInlineStart: numbered ? '1.25rem' : 0,
          listStyle: numbered ? undefined : 'none',
          margin: 0,
        }}
      >
        {sorted.map((item, i) => {
          const dir: ConstructorDir = item.lang === 'ar' ? 'rtl' : 'ltr';
          const fontFamily =
            dir === 'rtl'
              ? previewTheme.fontFamilyArabicStack
              : previewTheme.fontFamilyLatinStack;
          return (
            <li
              key={i}
              dir={dir}
              style={{
                fontFamily,
                fontSize: dir === 'rtl' ? '12pt' : '11pt',
                margin: '0.25rem 0',
              }}
            >
              <span
                dangerouslySetInnerHTML={{
                  __html: sanitizeConstructorTipTapHtml(
                    resolveReferenceEntryHtml(item),
                  ),
                }}
              />
              {item.doi ? ` https://doi.org/${item.doi}` : ''}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
