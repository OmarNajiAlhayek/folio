"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { resolveSectionDir } from "@/lib/constructor-direction";
import { referenceEntrySortKey, resolveReferenceEntryHtml } from "@/lib/constructor-rich-text";
import {
  sanitizeConstructorTipTapHtml,
  sanitizeKatexPreviewHtml,
} from "@/lib/sanitize-constructor-html";
import { apiBlob } from "@/lib/api";
import { parseKeywordsFromStorage } from "@/lib/keywords";
import { KeywordTagsDisplay } from "@/components/ui/keyword-tags-input";
import type { ManuscriptPreviewTheme } from "@/lib/manuscript-styles-catalog";
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
} from "@/lib/constructor-content.types";

interface LivePreviewProps {
  content: ConstructorContent;
  /** Theme from `GET /public/manuscript-styles` for the effective profile id. */
  previewTheme: ManuscriptPreviewTheme;
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
  slug,
  debounceMs = 300,
}: LivePreviewProps) {
  const t = useTranslations("ConstructorPreview");

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
      if (s.kind === "image") {
        figure += 1;
        map.set(s.id, figure);
      } else if (s.kind === "table") {
        table += 1;
        map.set(s.id, table);
      } else if (s.kind === "equation") {
        equation += 1;
        map.set(s.id, equation);
      }
    }
    return map;
  }, [debouncedContent.sections]);

  const defaultDir = content.defaultDir;
  const rootFont =
    defaultDir === "rtl"
      ? previewTheme.fontFamilyArabicStack
      : previewTheme.fontFamilyLatinStack;

  return (
    <aside
      className="rounded-2xl border border-ink/10 bg-surface/50 p-4 shadow-sm backdrop-blur-[2px] transition hover:border-ink/15 hover:shadow-md flex flex-col justify-stretch min-h-[600px]"
      aria-label={t("ariaLabel")}
    >
      <header className="border-b border-ink/10 pb-3 mb-4 text-xs font-medium uppercase tracking-wide text-ink/60">
        <div className="flex items-center gap-1.5 text-ink font-extrabold text-sm">
          <svg className="size-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t("header")}
        </div>
        <p className="mt-1 normal-case font-normal text-ink/50 text-[10px] tracking-normal leading-relaxed">{t("approximateNotice")}</p>
      </header>

      {/* Simulated physical publication paper layout canvas */}
      <div className="bg-neutral-100/50 dark:bg-neutral-950/40 rounded-xl p-4 md:p-6 border border-ink/5 flex-1 flex flex-col justify-stretch">
        {content.sections.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 px-4 text-center select-none animate-pulse">
            <div className="flex flex-col items-center">
              <div className="rounded-2xl bg-accent/5 dark:bg-accent/10 p-4 text-accent mb-4 border border-accent/10 shadow-xs">
                <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <h3 className="text-sm font-extrabold text-ink/80 mb-1">No sections committed yet</h3>
              <p className="text-xs text-ink/45 max-w-xs leading-relaxed">{t("empty")}</p>
            </div>
          </div>
        ) : (
          <div
            className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 md:p-8 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.03),0_10px_15px_-3px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.25),0_10px_15px_-3px_rgba(0,0,0,0.3)] transition-all duration-300 select-text"
            style={{
              fontFamily: rootFont,
            }}
            dir={defaultDir}
          >
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {content.sections.map((section) => (
                <div
                  key={section.id}
                  data-testid={`constructor-preview-section-${section.id}`}
                  className="transition-all duration-300 animate-fade-in mb-4 last:mb-0"
                >
                  <PreviewSection
                    section={section}
                    defaultDir={defaultDir}
                    slug={slug}
                    figureOrTableNumber={numbering.get(section.id)}
                    previewTheme={previewTheme}
                  />
                </div>
              ))}
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
  slug,
  figureOrTableNumber,
  previewTheme,
}: {
  section: ConstructorSection;
  defaultDir: ConstructorDir;
  slug?: string;
  figureOrTableNumber?: number;
  previewTheme: ManuscriptPreviewTheme;
}) {
  const dir = resolveSectionDir(section, defaultDir);
  const fontFamily =
    dir === "rtl"
      ? previewTheme.fontFamilyArabicStack
      : previewTheme.fontFamilyLatinStack;

  const wrapperStyle = { fontFamily };

  switch (section.kind) {
    case "title":
      return <PreviewTitle section={section} dir={dir} style={wrapperStyle} />;
    case "authors":
      return (
        <PreviewAuthors section={section} dir={dir} style={wrapperStyle} />
      );
    case "abstract":
      return (
        <PreviewAbstract section={section} previewTheme={previewTheme} />
      );
    case "heading1":
    case "heading2":
    case "heading3":
      return (
        <PreviewHeading section={section} dir={dir} style={wrapperStyle} />
      );
    case "paragraph":
      return (
        <PreviewParagraph section={section} dir={dir} style={wrapperStyle} />
      );
    case "image":
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
    case "table":
      return (
        <PreviewTable
          section={section}
          dir={dir}
          style={wrapperStyle}
          number={figureOrTableNumber ?? 0}
          previewTheme={previewTheme}
        />
      );
    case "acknowledgments":
    case "funding":
    case "conflictOfInterest":
    case "dataAvailability":
      return (
        <PreviewRichTextBlock
          section={section as RichTextBlockSection}
          dir={dir}
          style={wrapperStyle}
        />
      );
    case "equation":
      return (
        <PreviewEquation
          section={section}
          number={figureOrTableNumber ?? 0}
        />
      );
    case "references":
      return (
        <PreviewReferences section={section} previewTheme={previewTheme} />
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
        fontSize: "16pt",
        fontWeight: 700,
        textAlign: "center",
        margin: "0 0 0.75rem",
      }}
    >
      {section.text || "\u00a0"}
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
  if (section.authors.length === 0) {
    return null;
  }
  return (
    <div
      dir={dir}
      style={{ ...style, textAlign: "center", marginBottom: "1rem" }}
    >
      {section.authors.map((a, i) => (
        <p key={i} style={{ margin: "0.25rem 0", fontSize: "11pt" }}>
          <strong>
            {a.fullName}
            {a.isCorresponding ? "*" : ""}
          </strong>
          {a.title ? `, ${a.title}` : ""}
          {a.affiliation ? ` — ${a.affiliation}` : ""}
          {a.email ? ` (${a.email})` : ""}
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
  const dir: ConstructorDir = section.lang === "ar" ? "rtl" : "ltr";
  const fontFamily =
    dir === "rtl"
      ? previewTheme.fontFamilyArabicStack
      : previewTheme.fontFamilyLatinStack;
  const keywordTags = parseKeywordsFromStorage(section.keywords);
  return (
    <section dir={dir} style={{ fontFamily, marginBottom: "1rem" }}>
      <h2 style={{ fontSize: "14pt", fontWeight: 700, margin: "0 0 0.25rem" }}>
        {section.lang === "ar" ? "الملخص" : "Abstract"}
      </h2>
      <p style={{ fontSize: dir === "rtl" ? "12pt" : "11pt", margin: "0 0 0.5rem" }}>
        {section.text || "\u00a0"}
      </p>
      {keywordTags.length > 0 ? (
        <p
          style={{
            fontSize: dir === "rtl" ? "12pt" : "11pt",
            margin: 0,
            fontStyle: "italic",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            gap: "0.35rem",
          }}
        >
          <strong>
            {section.lang === "ar" ? "الكلمات المفتاحية: " : "Keywords: "}
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
  const sizeMap = { heading1: "14pt", heading2: "13pt", heading3: "12pt" };
  const Tag = section.kind === "heading1"
    ? "h2"
    : section.kind === "heading2"
      ? "h3"
      : "h4";
  return (
    <Tag
      dir={dir}
      style={{
        ...style,
        fontSize: sizeMap[section.kind],
        fontWeight: 700,
        margin: "0.75rem 0 0.5rem",
      }}
    >
      {section.text || "\u00a0"}
    </Tag>
  );
}

function PreviewParagraph({
  section,
  dir,
  style,
}: {
  section: ParagraphSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
}) {
  const safeHtml = useMemo(
    () => sanitizeConstructorTipTapHtml(section.html || "<p></p>"),
    [section.html],
  );
  return (
    <div
      dir={dir}
      style={{
        ...style,
        fontSize: dir === "rtl" ? "12pt" : "11pt",
        lineHeight: 1.4,
        margin: "0 0 0.5rem",
      }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
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
  const captionLabel = `${previewTheme.figureWord} ${number}`;
  const captionBlock = (
    <figcaption
      style={{
        fontSize: "10pt",
        fontWeight: 700,
        marginTop: previewTheme.figureCaptionBelowImage ? "0.25rem" : 0,
        marginBottom: previewTheme.figureCaptionBelowImage ? 0 : "0.25rem",
      }}
    >
      {captionLabel}
      {section.caption ? `: ${section.caption}` : ""}
    </figcaption>
  );

  const imgBlock =
    section.fileId && slug ? (
      <ProtectedImage slug={slug} fileId={section.fileId} alt={section.altText} />
    ) : (
      <div
        aria-hidden
        className="mx-auto flex h-32 w-full max-w-md items-center justify-center rounded border border-dashed border-ink/20 bg-paper/40 text-xs text-ink/45"
      >
        {section.altText || "(no image)"}
      </div>
    );

  return (
    <figure dir={dir} style={{ ...style, margin: "0.75rem 0", textAlign: "center" }}>
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
    apiBlob(
      `/submissions/${encodeURIComponent(slug)}/files/${fileId}`,
      { signal: controller.signal },
    )
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
      style={{ maxWidth: "100%", maxHeight: "16rem", display: "inline-block" }}
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
  const captionLabel = `${previewTheme.tableWord} ${number}`;
  const captionEl = (
    <p
      style={{
        fontSize: "10pt",
        fontWeight: 700,
        textAlign: "center",
        margin: previewTheme.tableCaptionAboveTable ? "0 0 0.25rem" : "0.25rem 0 0",
      }}
    >
      {captionLabel}
      {section.caption ? `: ${section.caption}` : ""}
    </p>
  );

  const tableEl = (
    <table
      style={{
        borderCollapse: "collapse",
        width: "100%",
        fontSize: dir === "rtl" ? "12pt" : "11pt",
      }}
    >
      <tbody>
        {section.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => {
              const isHeader = section.hasHeaderRow && r === 0;
              const Tag = isHeader ? "th" : "td";
              return (
                <Tag
                  key={c}
                  style={{
                    border: "1px solid #999",
                    padding: "4px 8px",
                    fontWeight: isHeader ? 700 : 400,
                    textAlign: "start",
                  }}
                >
                  {cell || "\u00a0"}
                </Tag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div dir={dir} style={{ ...style, margin: "0.75rem 0" }}>
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
            fontSize: "10pt",
            marginTop: "0.35rem",
            textAlign: dir === "rtl" ? "right" : "left",
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
}: {
  section: RichTextBlockSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
}) {
  const safeHtml = useMemo(
    () => sanitizeConstructorTipTapHtml(section.html || "<p></p>"),
    [section.html],
  );
  return (
    <div
      dir={dir}
      style={{ ...style, margin: "0.75rem 0", fontSize: "11pt" }}
      className="constructor-preview-html"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
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
  const t = useTranslations("ConstructorPreview");
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
        const katex = await import("katex");
        await import("katex/dist/katex.min.css");
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

  const label =
    section.numbered && number > 0 ? ` (${number})` : "";

  return (
    <div style={{ margin: "0.75rem 0", textAlign: "center" }}>
      {previewError ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {t("equationPreviewError")}
        </p>
      ) : previewHtml ? (
        <div
          className="katex-preview overflow-x-auto"
          dangerouslySetInnerHTML={{
            __html: sanitizeKatexPreviewHtml(previewHtml),
          }}
        />
      ) : section.latex.trim() ? null : (
        <span className="text-ink/45">{t("equationEmpty")}</span>
      )}
      {label ? <span>{label}</span> : null}
    </div>
  );
}

function PreviewReferences({
  section,
  previewTheme,
}: {
  section: ReferencesSection;
  previewTheme: ManuscriptPreviewTheme;
}) {
  const sorted = useMemo(() => {
    const ar = section.items
      .filter((i) => i.lang === "ar")
      .slice()
      .sort((a, b) =>
        referenceEntrySortKey(a).localeCompare(referenceEntrySortKey(b), "ar"),
      );
    const en = section.items
      .filter((i) => i.lang === "en")
      .slice()
      .sort((a, b) =>
        referenceEntrySortKey(a).localeCompare(referenceEntrySortKey(b), "en"),
      );
    return previewTheme.referencesArabicFirst ? [...ar, ...en] : [...en, ...ar];
  }, [section.items, previewTheme.referencesArabicFirst]);

  return (
    <section style={{ margin: "1rem 0 0" }}>
      <h2
        style={{
          fontSize: "14pt",
          fontWeight: 700,
          margin: "0 0 0.5rem",
        }}
      >
        {previewTheme.referencesHeading}
      </h2>
      <ol style={{ paddingInlineStart: "1.25rem", margin: 0 }}>
        {sorted.map((item, i) => {
          const dir: ConstructorDir = item.lang === "ar" ? "rtl" : "ltr";
          const fontFamily =
            dir === "rtl"
              ? previewTheme.fontFamilyArabicStack
              : previewTheme.fontFamilyLatinStack;
          return (
            <li
              key={i}
              dir={dir}
              style={{
                fontFamily,
                fontSize: dir === "rtl" ? "12pt" : "11pt",
                margin: "0.25rem 0",
              }}
            >
              <span
                dangerouslySetInnerHTML={{
                  __html: sanitizeConstructorTipTapHtml(
                    resolveReferenceEntryHtml(item),
                  ),
                }}
              />
              {item.doi ? ` https://doi.org/${item.doi}` : ""}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
