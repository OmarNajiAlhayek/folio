"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { resolveSectionDir } from "@/lib/constructor-direction";
import { getApiBase, getStoredToken } from "@/lib/api";
import { parseKeywordsFromStorage } from "@/lib/keywords";
import { KeywordTagsDisplay } from "@/components/ui/keyword-tags-input";
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
  TableSection,
  TitleSection,
} from "@/lib/constructor-content.types";

interface LivePreviewProps {
  content: ConstructorContent;
  /** Required to render image previews via the protected files endpoint. */
  slug?: string;
  /**
   * Debounce in ms before recomputing derived state (numbering, sorted refs).
   * Defaults to 300 per plan section B.
   */
  debounceMs?: number;
}

/**
 * Side-by-side approximation of the generated .docx. Mirrors the styles
 * defined in `style.md` and the spans/runs used by `DocxGeneratorService`:
 *
 *   - "Simplified Arabic" 12pt for RTL sections
 *   - "Times New Roman" 11pt for LTR sections
 *   - Title 16pt bold, H1/H2 14pt bold (subtitle scale)
 *   - Figure caption BELOW image, bold 10pt; Table caption ABOVE table.
 *   - Reference list: Arabic refs first, then English, alphabetised within each group.
 *
 * This is an approximation, not byte-perfect Word rendering. The server
 * remains the source of truth for the final .docx.
 */
export function LivePreview({
  content,
  slug,
  debounceMs = 300,
}: LivePreviewProps) {
  const t = useTranslations("ConstructorPreview");

  // Debounce the content used for *expensive* derivations (numbering, sort).
  // Direct text changes still re-render via React's normal cycle; the
  // debounce just keeps the heavy bits stable while typing fast.
  const [debouncedContent, setDebouncedContent] = useState(content);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedContent(content), debounceMs);
    return () => clearTimeout(t);
  }, [content, debounceMs]);

  // Derive caption numbering from the debounced content so figure/table N
  // labels don't churn every keystroke.
  const numbering = useMemo(() => {
    const map = new Map<string, number>();
    let figure = 0;
    let table = 0;
    for (const s of debouncedContent.sections) {
      if (s.kind === "image") {
        figure += 1;
        map.set(s.id, figure);
      } else if (s.kind === "table") {
        table += 1;
        map.set(s.id, table);
      }
    }
    return map;
  }, [debouncedContent.sections]);

  const defaultDir = content.defaultDir;

  return (
    <aside
      className="rounded-lg border border-ink/10 bg-surface shadow-sm"
      aria-label={t("ariaLabel")}
    >
      <header className="border-b border-ink/10 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink/60">
        {t("header")}
      </header>
      <div
        className="prose prose-sm max-w-none p-6"
        style={{
          // Approximate the Word margins (3cm top, 2cm sides) with proportionally
          // sized padding rather than absolute cm to fit the side panel.
          fontFamily:
            defaultDir === "rtl"
              ? '"Simplified Arabic", "Noto Naskh Arabic", serif'
              : '"Times New Roman", "Liberation Serif", serif',
        }}
        dir={defaultDir}
      >
        {content.sections.length === 0 ? (
          <p className="text-sm italic text-ink/55">{t("empty")}</p>
        ) : (
          content.sections.map((section) => (
            <div
              key={section.id}
              data-testid={`constructor-preview-section-${section.id}`}
            >
              <PreviewSection
                section={section}
                defaultDir={defaultDir}
                slug={slug}
                figureOrTableNumber={numbering.get(section.id)}
              />
            </div>
          ))
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
}: {
  section: ConstructorSection;
  defaultDir: ConstructorDir;
  slug?: string;
  figureOrTableNumber?: number;
}) {
  const dir = resolveSectionDir(section, defaultDir);
  const fontFamily =
    dir === "rtl"
      ? '"Simplified Arabic", "Noto Naskh Arabic", serif'
      : '"Times New Roman", "Liberation Serif", serif';

  const wrapperStyle = { fontFamily };

  switch (section.kind) {
    case "title":
      return <PreviewTitle section={section} dir={dir} style={wrapperStyle} />;
    case "authors":
      return (
        <PreviewAuthors section={section} dir={dir} style={wrapperStyle} />
      );
    case "abstract":
      return <PreviewAbstract section={section} />;
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
        />
      );
    case "table":
      return (
        <PreviewTable
          section={section}
          dir={dir}
          style={wrapperStyle}
          number={figureOrTableNumber ?? 0}
        />
      );
    case "references":
      return <PreviewReferences section={section} />;
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

function PreviewAbstract({ section }: { section: AbstractSection }) {
  const dir: ConstructorDir = section.lang === "ar" ? "rtl" : "ltr";
  const fontFamily =
    dir === "rtl"
      ? '"Simplified Arabic", "Noto Naskh Arabic", serif'
      : '"Times New Roman", "Liberation Serif", serif';
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
  return (
    <div
      dir={dir}
      style={{
        ...style,
        fontSize: dir === "rtl" ? "12pt" : "11pt",
        lineHeight: 1.4,
        margin: "0 0 0.5rem",
      }}
      // TipTap output is sanitised by the backend on submit; for the preview
      // we trust the local state since the same rules will apply server-side.
      dangerouslySetInnerHTML={{ __html: section.html || "<p></p>" }}
    />
  );
}

function PreviewImage({
  section,
  dir,
  style,
  slug,
  number,
}: {
  section: ImageSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
  slug?: string;
  number: number;
}) {
  const captionLabel = dir === "rtl" ? `الشكل ${number}` : `Figure ${number}`;
  return (
    <figure dir={dir} style={{ ...style, margin: "0.75rem 0", textAlign: "center" }}>
      {section.fileId && slug ? (
        <ProtectedImage slug={slug} fileId={section.fileId} alt={section.altText} />
      ) : (
        <div
          aria-hidden
          className="mx-auto flex h-32 w-full max-w-md items-center justify-center rounded border border-dashed border-ink/20 bg-paper/40 text-xs text-ink/45"
        >
          {section.altText || "(no image)"}
        </div>
      )}
      <figcaption
        style={{
          fontSize: "10pt",
          fontWeight: 700,
          marginTop: "0.25rem",
        }}
      >
        {captionLabel}
        {section.caption ? `: ${section.caption}` : ""}
      </figcaption>
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
    let cancelled = false;
    let objectUrl: string | null = null;
    const token = getStoredToken();
    if (!token) return;
    fetch(
      `${getApiBase()}/api/v1/submissions/${encodeURIComponent(slug)}/files/${fileId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
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
}: {
  section: TableSection;
  dir: ConstructorDir;
  style: React.CSSProperties;
  number: number;
}) {
  const captionLabel = dir === "rtl" ? `الجدول ${number}` : `Table ${number}`;
  return (
    <div dir={dir} style={{ ...style, margin: "0.75rem 0" }}>
      <p
        style={{
          fontSize: "10pt",
          fontWeight: 700,
          textAlign: "center",
          margin: "0 0 0.25rem",
        }}
      >
        {captionLabel}
        {section.caption ? `: ${section.caption}` : ""}
      </p>
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
    </div>
  );
}

function PreviewReferences({ section }: { section: ReferencesSection }) {
  // Per style.md: Arabic references first, then English, alphabetised within each group.
  const sorted = useMemo(() => {
    const ar = section.items
      .filter((i) => i.lang === "ar")
      .slice()
      .sort((a, b) => a.text.localeCompare(b.text, "ar"));
    const en = section.items
      .filter((i) => i.lang === "en")
      .slice()
      .sort((a, b) => a.text.localeCompare(b.text, "en"));
    return [...ar, ...en];
  }, [section.items]);

  return (
    <section style={{ margin: "1rem 0 0" }}>
      <h2
        style={{
          fontSize: "14pt",
          fontWeight: 700,
          margin: "0 0 0.5rem",
        }}
      >
        References
      </h2>
      <ol style={{ paddingInlineStart: "1.25rem", margin: 0 }}>
        {sorted.map((item, i) => {
          const dir: ConstructorDir = item.lang === "ar" ? "rtl" : "ltr";
          const fontFamily =
            dir === "rtl"
              ? '"Simplified Arabic", "Noto Naskh Arabic", serif'
              : '"Times New Roman", "Liberation Serif", serif';
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
              {item.text}
              {item.doi ? ` https://doi.org/${item.doi}` : ""}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
