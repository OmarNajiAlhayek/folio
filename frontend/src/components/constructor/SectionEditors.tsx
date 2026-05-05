"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  apiUpload,
  ApiError,
  getApiBase,
  getStoredToken,
} from "@/lib/api";
import {
  detectDirection,
  resolveSectionDir,
} from "@/lib/constructor-direction";
import { parseKeywordsFromStorage, serializeKeywords } from "@/lib/keywords";
import { KeywordTagsInput } from "@/components/ui/keyword-tags-input";
import type {
  AbstractSection,
  AuthorsSection,
  ConstructorAuthorEntry,
  ConstructorReferenceEntry,
  ConstructorDir,
  ConstructorSection,
  HeadingSection,
  ImageSection,
  ParagraphSection,
  ReferencesSection,
  TableSection,
  TitleSection,
} from "@/lib/constructor-content.types";

interface CommonProps<T extends ConstructorSection> {
  section: T;
  defaultDir: ConstructorDir;
  onChange: (next: T) => void;
  /**
   * Submission slug, only required for ImageSection editor (uploads use the
   * `/submissions/:slug/files` endpoint). When undefined, the image editor
   * shows a "save the draft first to upload images" hint.
   */
  slug?: string;
  readOnly?: boolean;
}

/**
 * Single entry point — dispatches on `section.kind`. The host component
 * (`SectionList`) wraps each editor in its own card with reorder controls.
 */
export function SectionEditor(
  props: CommonProps<ConstructorSection>,
): ReactElement {
  const { section } = props;
  switch (section.kind) {
    case "title":
      return (
        <TitleEditor {...(props as CommonProps<TitleSection>)} />
      );
    case "authors":
      return (
        <AuthorsEditor {...(props as CommonProps<AuthorsSection>)} />
      );
    case "abstract":
      return (
        <AbstractEditor {...(props as CommonProps<AbstractSection>)} />
      );
    case "heading1":
    case "heading2":
    case "heading3":
      return (
        <HeadingEditor {...(props as CommonProps<HeadingSection>)} />
      );
    case "paragraph":
      return (
        <ParagraphEditor {...(props as CommonProps<ParagraphSection>)} />
      );
    case "image":
      return (
        <ImageEditor {...(props as CommonProps<ImageSection>)} />
      );
    case "table":
      return (
        <TableEditor {...(props as CommonProps<TableSection>)} />
      );
    case "references":
      return (
        <ReferencesEditor {...(props as CommonProps<ReferencesSection>)} />
      );
  }
}

// -----------------------------------------------------------------------------
// Direction badge
// -----------------------------------------------------------------------------

function DirectionBadge({
  section,
  defaultDir,
  onChange,
  disabled,
}: {
  section: ConstructorSection;
  defaultDir: ConstructorDir;
  onChange: (next: ConstructorSection) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("ConstructorEditor");
  if (section.kind === "abstract") {
    // Abstract direction is locked to its `lang` field.
    return null;
  }
  const dir = resolveSectionDir(section, defaultDir);
  const source = section.dirSource ?? "auto";
  const label =
    source === "manual"
      ? dir === "rtl"
        ? t("dirRtlManual")
        : t("dirLtrManual")
      : dir === "rtl"
        ? t("dirRtlAuto")
        : t("dirLtrAuto");
  const next: ConstructorDir = dir === "rtl" ? "ltr" : "rtl";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        onChange({
          ...section,
          dir: next,
          dirSource: "manual",
        } as ConstructorSection)
      }
      className="inline-flex items-center gap-1 rounded border border-ink/15 bg-paper px-2 py-1 text-xs text-ink/70 hover:border-accent/40 disabled:opacity-50"
      title={t("dirToggleHint")}
    >
      {label}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Title / Heading editors (single-line text)
// -----------------------------------------------------------------------------

function TitleEditor({
  section,
  defaultDir,
  onChange,
  readOnly,
}: CommonProps<TitleSection>) {
  const t = useTranslations("ConstructorEditor");
  const dir = resolveSectionDir(section, defaultDir);
  return (
    <SectionFrame
      label={t("titleLabel")}
      hint={t("titleHint")}
      headerExtra={
        <DirectionBadge
          section={section}
          defaultDir={defaultDir}
          onChange={(s) => onChange(s as TitleSection)}
          disabled={readOnly}
        />
      }
    >
      <input
        dir={dir}
        readOnly={readOnly}
        type="text"
        value={section.text}
        onChange={(e) =>
          onChange(applyAutoDir(section, { text: e.target.value }))
        }
        className="w-full rounded-md border border-ink/20 bg-paper px-3 py-2 font-serif text-xl font-semibold text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        placeholder={t("titlePlaceholder")}
      />
    </SectionFrame>
  );
}

function HeadingEditor({
  section,
  defaultDir,
  onChange,
  readOnly,
}: CommonProps<HeadingSection>) {
  const t = useTranslations("ConstructorEditor");
  const dir = resolveSectionDir(section, defaultDir);
  const sizeCls =
    section.kind === "heading1"
      ? "text-2xl font-bold"
      : section.kind === "heading2"
        ? "text-xl font-semibold"
        : "text-lg font-semibold";
  return (
    <SectionFrame
      label={t(`heading_${section.kind}` as const)}
      hint={t("headingHint")}
      headerExtra={
        <DirectionBadge
          section={section}
          defaultDir={defaultDir}
          onChange={(s) => onChange(s as HeadingSection)}
          disabled={readOnly}
        />
      }
    >
      <input
        dir={dir}
        readOnly={readOnly}
        type="text"
        value={section.text}
        onChange={(e) =>
          onChange(applyAutoDir(section, { text: e.target.value }))
        }
        className={`w-full rounded-md border border-ink/20 bg-paper px-3 py-2 font-serif text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${sizeCls}`}
        placeholder={t("headingPlaceholder")}
      />
    </SectionFrame>
  );
}

// -----------------------------------------------------------------------------
// Authors
// -----------------------------------------------------------------------------

function AuthorsEditor({
  section,
  defaultDir,
  onChange,
  readOnly,
}: CommonProps<AuthorsSection>) {
  const t = useTranslations("ConstructorEditor");
  const dir = resolveSectionDir(section, defaultDir);

  function update(idx: number, patch: Partial<ConstructorAuthorEntry>) {
    const next = section.authors.map((a, i) =>
      i === idx ? { ...a, ...patch } : a,
    );
    onChange({ ...section, authors: next });
  }
  function addAuthor() {
    onChange({
      ...section,
      authors: [
        ...section.authors,
        {
          fullName: "",
          title: "",
          affiliation: "",
          email: "",
          isCorresponding: section.authors.length === 0,
        },
      ],
    });
  }
  function remove(idx: number) {
    onChange({
      ...section,
      authors: section.authors.filter((_, i) => i !== idx),
    });
  }
  function setCorresponding(idx: number) {
    onChange({
      ...section,
      authors: section.authors.map((a, i) => ({
        ...a,
        isCorresponding: i === idx,
      })),
    });
  }

  return (
    <SectionFrame
      label={t("authorsLabel")}
      hint={t("authorsHint")}
      headerExtra={
        <DirectionBadge
          section={section}
          defaultDir={defaultDir}
          onChange={(s) => onChange(s as AuthorsSection)}
          disabled={readOnly}
        />
      }
    >
      <ul className="space-y-3">
        {section.authors.map((a, idx) => (
          <li
            key={idx}
            className="rounded-md border border-ink/10 bg-paper/40 p-3"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                dir={dir}
                disabled={readOnly}
                value={a.fullName}
                onChange={(e) => update(idx, { fullName: e.target.value })}
                className="rounded border border-ink/20 bg-paper px-2 py-1 text-sm"
                placeholder={t("authorFullName")}
              />
              <input
                dir={dir}
                disabled={readOnly}
                value={a.title}
                onChange={(e) => update(idx, { title: e.target.value })}
                className="rounded border border-ink/20 bg-paper px-2 py-1 text-sm"
                placeholder={t("authorTitle")}
              />
              <input
                dir={dir}
                disabled={readOnly}
                value={a.affiliation}
                onChange={(e) => update(idx, { affiliation: e.target.value })}
                className="rounded border border-ink/20 bg-paper px-2 py-1 text-sm sm:col-span-2"
                placeholder={t("authorAffiliation")}
              />
              <input
                disabled={readOnly}
                value={a.email}
                onChange={(e) => update(idx, { email: e.target.value })}
                className="rounded border border-ink/20 bg-paper px-2 py-1 text-sm"
                placeholder={t("authorEmail")}
              />
              <label className="flex items-center gap-2 text-sm text-ink/80">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={a.isCorresponding}
                  onChange={() => setCorresponding(idx)}
                />
                {t("authorCorresponding")}
              </label>
            </div>
            <div className="mt-2 text-end">
              <button
                type="button"
                disabled={readOnly}
                onClick={() => remove(idx)}
                className="text-xs text-red-700 hover:underline dark:text-red-300 disabled:opacity-50"
              >
                {t("authorRemove")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={readOnly}
        onClick={addAuthor}
        className="mt-3 rounded-md border border-ink/15 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-50"
      >
        {t("authorAdd")}
      </button>
    </SectionFrame>
  );
}

// -----------------------------------------------------------------------------
// Abstract
// -----------------------------------------------------------------------------

function AbstractEditor({
  section,
  onChange,
  readOnly,
}: CommonProps<AbstractSection>) {
  const t = useTranslations("ConstructorEditor");
  const tWf = useTranslations("SubmissionWorkflow");
  const idBase = useId();
  const kwLabelId = `${idBase}-abstract-kw-label`;
  const kwHintId = `${idBase}-abstract-kw-hint`;
  const kwInputId = `${idBase}-abstract-kw-input`;

  const [keywordDraft, setKeywordDraft] = useState("");
  const keywordTags = useMemo(
    () => parseKeywordsFromStorage(section.keywords),
    [section.keywords],
  );

  const dir: ConstructorDir = section.lang === "ar" ? "rtl" : "ltr";
  const kwPlaceholder =
    section.lang === "ar"
      ? tWf("keywordsPlaceholderAr")
      : tWf("keywordsPlaceholder");

  return (
    <SectionFrame
      label={t(section.lang === "ar" ? "abstractAr" : "abstractEn")}
      hint={t("abstractHint")}
      headerExtra={
        <select
          disabled={readOnly}
          value={section.lang}
          onChange={(e) =>
            onChange({
              ...section,
              lang: e.target.value as "en" | "ar",
            })
          }
          className="rounded border border-ink/15 bg-paper px-2 py-1 text-xs text-ink/70"
        >
          <option value="en">{t("abstractLangEn")}</option>
          <option value="ar">{t("abstractLangAr")}</option>
        </select>
      }
    >
      <textarea
        dir={dir}
        readOnly={readOnly}
        value={section.text}
        onChange={(e) => onChange({ ...section, text: e.target.value })}
        className="min-h-32 w-full rounded-md border border-ink/20 bg-paper px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        placeholder={t("abstractPlaceholder")}
      />
      <div className="mt-2 flex flex-col gap-1 text-sm">
        <span
          id={kwLabelId}
          className="font-medium text-ink"
        >
          {section.lang === "ar"
            ? tWf("keywordsLabelAr")
            : tWf("keywordsLabelEn")}
        </span>
        <div
          dir={section.lang === "ar" ? "rtl" : "ltr"}
          lang={section.lang === "ar" ? "ar" : "en"}
        >
          <KeywordTagsInput
            tags={keywordTags}
            onChange={(next) =>
              onChange({
                ...section,
                keywords: serializeKeywords(next),
              })
            }
            inputValue={keywordDraft}
            onInputChange={setKeywordDraft}
            placeholder={kwPlaceholder}
            id={kwInputId}
            aria-labelledby={kwLabelId}
            aria-describedby={kwHintId}
            disabled={readOnly}
          />
        </div>
        <span id={kwHintId} className="text-xs text-ink/55">
          {tWf("keywordsCount", { count: keywordTags.length })}
        </span>
      </div>
    </SectionFrame>
  );
}

// -----------------------------------------------------------------------------
// Paragraph (TipTap)
// -----------------------------------------------------------------------------

function ParagraphEditor({
  section,
  defaultDir,
  onChange,
  readOnly,
}: CommonProps<ParagraphSection>) {
  const t = useTranslations("ConstructorEditor");
  const dir = resolveSectionDir(section, defaultDir);

  const editor = useEditor(
    {
      // Allowlist enforced by disabling the rest of StarterKit.
      // Image extension is INTENTIONALLY left out so paragraphs cannot
      // contain inline base64 images (use the dedicated Image section).
      extensions: [
        StarterKit.configure({
          blockquote: false,
          code: false,
          codeBlock: false,
          heading: false,
          horizontalRule: false,
          link: false,
          strike: false,
        }),
      ],
      content: section.html || "<p></p>",
      editable: !readOnly,
      immediatelyRender: false, // required for SSR (Next.js)
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        onChange(applyAutoDir(section, { html }));
      },
      editorProps: {
        attributes: {
          // `dir` here only sets the initial value; the wrapping <div dir={dir}>
          // below is the live source of truth (directionality cascades to the
          // contenteditable via the bidi algorithm).
          class:
            "prose prose-sm max-w-none min-h-24 focus:outline-none rounded-md border border-ink/20 bg-paper px-3 py-2 shadow-sm",
        },
        // Prevent pasting images (would inline as base64)
        handlePaste: (_view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of items) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              return true;
            }
          }
          return false;
        },
      },
    },
    [readOnly],
  );

  // External content updates (e.g., on initial load) — only apply when the
  // editor is empty or the HTML differs significantly to avoid cursor jumps.
  useEffect(() => {
    if (editor && section.html !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(section.html || "<p></p>", {
        emitUpdate: false,
      });
    }
  }, [editor, section.html]);

  return (
    <SectionFrame
      label={t("paragraphLabel")}
      hint={t("paragraphHint")}
      headerExtra={
        <DirectionBadge
          section={section}
          defaultDir={defaultDir}
          onChange={(s) => onChange(s as ParagraphSection)}
          disabled={readOnly}
        />
      }
    >
      {editor ? <Toolbar editor={editor} disabled={readOnly} /> : null}
      <div dir={dir}>
        <EditorContent editor={editor} />
      </div>
    </SectionFrame>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const t = useTranslations("ConstructorEditor");
  const btn =
    "rounded border border-ink/15 bg-paper px-2 py-1 text-xs font-medium text-ink hover:border-accent/40 disabled:opacity-50";
  const active = "border-accent/60 bg-accent/10";
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`${btn} ${editor.isActive("bold") ? active : ""}`}
        title={t("toolbarBold")}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${btn} ${editor.isActive("italic") ? active : ""}`}
        title={t("toolbarItalic")}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`${btn} ${editor.isActive("underline") ? active : ""}`}
        title={t("toolbarUnderline")}
      >
        <span className="underline">U</span>
      </button>
      <span className="mx-1 text-ink/20">|</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`${btn} ${editor.isActive("bulletList") ? active : ""}`}
        title={t("toolbarBulletList")}
      >
        •
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${btn} ${editor.isActive("orderedList") ? active : ""}`}
        title={t("toolbarOrderedList")}
      >
        1.
      </button>
      <span className="mx-1 text-ink/20">|</span>
      <button
        type="button"
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
        className={btn}
        title={t("toolbarUndo")}
      >
        ↶
      </button>
      <button
        type="button"
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
        className={btn}
        title={t("toolbarRedo")}
      >
        ↷
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Image
// -----------------------------------------------------------------------------

function ImageEditor({
  section,
  defaultDir,
  onChange,
  slug,
  readOnly,
}: CommonProps<ImageSection>) {
  const t = useTranslations("ConstructorEditor");
  const fileInputId = useId();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dir = resolveSectionDir(section, defaultDir);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!slug) {
      setErr(t("imageNeedsDraft"));
      return;
    }
    setErr(null);
    setUploading(true);
    try {
      const row = (await apiUpload(
        `/submissions/${encodeURIComponent(slug)}/files`,
        file,
        { kind: "figure" },
      )) as { id: string };
      onChange({ ...section, fileId: row.id });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("imageUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <SectionFrame
      label={t("imageLabel")}
      hint={t("imageHint")}
      headerExtra={
        <DirectionBadge
          section={section}
          defaultDir={defaultDir}
          onChange={(s) => onChange(s as ImageSection)}
          disabled={readOnly}
        />
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={fileInputId}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/bmp"
            className="sr-only"
            disabled={readOnly || uploading}
            onChange={(e) => {
              void handleFile(e.target.files?.[0] ?? undefined);
              e.target.value = "";
            }}
          />
          <label
            htmlFor={fileInputId}
            className={`inline-flex cursor-pointer items-center rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 ${
              readOnly || uploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {section.fileId ? t("imageReplace") : t("imageUpload")}
          </label>
          {section.fileId ? (
            <span className="text-xs text-ink/60">{t("imageAttached")}</span>
          ) : (
            <span className="text-xs text-ink/50">{t("imageNotUploaded")}</span>
          )}
          {uploading ? (
            <span className="text-xs text-ink/60">{t("imageUploading")}</span>
          ) : null}
        </div>
        {err ? (
          <p className="text-sm text-red-700 dark:text-red-300">{err}</p>
        ) : null}
        {section.fileId && slug ? (
          <ImagePreview slug={slug} fileId={section.fileId} />
        ) : null}
        <input
          dir={dir}
          readOnly={readOnly}
          value={section.altText}
          onChange={(e) => onChange({ ...section, altText: e.target.value })}
          placeholder={t("imageAltText")}
          className="w-full rounded-md border border-ink/20 bg-paper px-3 py-2 text-sm shadow-sm"
        />
        <input
          dir={dir}
          readOnly={readOnly}
          value={section.caption}
          onChange={(e) =>
            onChange(applyAutoDir(section, { caption: e.target.value }))
          }
          placeholder={t("imageCaption")}
          className="w-full rounded-md border border-ink/20 bg-paper px-3 py-2 text-sm shadow-sm"
        />
      </div>
    </SectionFrame>
  );
}

function ImagePreview({ slug, fileId }: { slug: string; fileId: string }) {
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
    <div className="rounded border border-ink/10 bg-paper/40 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="mx-auto max-h-64 max-w-full object-contain"
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Table
// -----------------------------------------------------------------------------

function TableEditor({
  section,
  defaultDir,
  onChange,
  readOnly,
}: CommonProps<TableSection>) {
  const t = useTranslations("ConstructorEditor");
  const dir = resolveSectionDir(section, defaultDir);

  function setCell(r: number, c: number, value: string) {
    const next = section.rows.map((row, i) =>
      i === r ? row.map((cell, j) => (j === c ? value : cell)) : row,
    );
    onChange({ ...section, rows: next });
  }
  function addRow() {
    const cols = section.rows[0]?.length ?? 2;
    onChange({
      ...section,
      rows: [...section.rows, Array(cols).fill("")],
    });
  }
  function addColumn() {
    onChange({
      ...section,
      rows: section.rows.map((r) => [...r, ""]),
    });
  }
  function removeRow(r: number) {
    if (section.rows.length <= 1) return;
    onChange({
      ...section,
      rows: section.rows.filter((_, i) => i !== r),
    });
  }
  function removeColumn(c: number) {
    if ((section.rows[0]?.length ?? 0) <= 1) return;
    onChange({
      ...section,
      rows: section.rows.map((r) => r.filter((_, j) => j !== c)),
    });
  }

  return (
    <SectionFrame
      label={t("tableLabel")}
      hint={t("tableHint")}
      headerExtra={
        <DirectionBadge
          section={section}
          defaultDir={defaultDir}
          onChange={(s) => onChange(s as TableSection)}
          disabled={readOnly}
        />
      }
    >
      <div className="space-y-2">
        <input
          dir={dir}
          readOnly={readOnly}
          value={section.caption}
          onChange={(e) =>
            onChange(applyAutoDir(section, { caption: e.target.value }))
          }
          placeholder={t("tableCaption")}
          className="w-full rounded-md border border-ink/20 bg-paper px-3 py-2 text-sm shadow-sm"
        />
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={section.hasHeaderRow}
            onChange={(e) =>
              onChange({ ...section, hasHeaderRow: e.target.checked })
            }
          />
          {t("tableHasHeader")}
        </label>
        <div className="overflow-auto rounded border border-ink/10">
          <table className="min-w-full border-collapse">
            <tbody>
              {section.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-ink/10 p-1 align-top">
                      <textarea
                        dir={dir}
                        readOnly={readOnly}
                        value={cell}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        rows={1}
                        className={`w-full min-w-32 resize-y rounded border-0 bg-transparent px-2 py-1 text-sm focus:bg-accent/5 focus:outline-none ${
                          section.hasHeaderRow && r === 0 ? "font-semibold" : ""
                        }`}
                      />
                    </td>
                  ))}
                  <td className="border-l border-ink/10 p-1 text-center">
                    <button
                      type="button"
                      disabled={readOnly || section.rows.length <= 1}
                      onClick={() => removeRow(r)}
                      className="text-xs text-red-700 hover:underline dark:text-red-300 disabled:opacity-30"
                      title={t("tableRemoveRow")}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                {section.rows[0]?.map((_, c) => (
                  <td key={c} className="border-t border-ink/10 p-1 text-center">
                    <button
                      type="button"
                      disabled={
                        readOnly || (section.rows[0]?.length ?? 0) <= 1
                      }
                      onClick={() => removeColumn(c)}
                      className="text-xs text-red-700 hover:underline dark:text-red-300 disabled:opacity-30"
                      title={t("tableRemoveColumn")}
                    >
                      ×
                    </button>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={readOnly}
            onClick={addRow}
            className="rounded-md border border-ink/15 bg-paper px-3 py-1 text-sm text-ink hover:border-accent/40 disabled:opacity-50"
          >
            {t("tableAddRow")}
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={addColumn}
            className="rounded-md border border-ink/15 bg-paper px-3 py-1 text-sm text-ink hover:border-accent/40 disabled:opacity-50"
          >
            {t("tableAddColumn")}
          </button>
        </div>
        <p className="text-xs text-ink/55">{t("tableNoMergedCells")}</p>
      </div>
    </SectionFrame>
  );
}

// -----------------------------------------------------------------------------
// References
// -----------------------------------------------------------------------------

function ReferencesEditor({
  section,
  onChange,
  readOnly,
}: CommonProps<ReferencesSection>) {
  const t = useTranslations("ConstructorEditor");

  function updateItem(idx: number, patch: Partial<ConstructorReferenceEntry>) {
    onChange({
      ...section,
      items: section.items.map((it, i) =>
        i === idx ? { ...it, ...patch } : it,
      ),
    });
  }
  function addItem() {
    onChange({
      ...section,
      items: [...section.items, { lang: "en", text: "" }],
    });
  }
  function removeItem(idx: number) {
    onChange({
      ...section,
      items: section.items.filter((_, i) => i !== idx),
    });
  }

  return (
    <SectionFrame label={t("referencesLabel")} hint={t("referencesHint")}>
      <ul className="space-y-2">
        {section.items.map((item, idx) => {
          const dir: ConstructorDir = item.lang === "ar" ? "rtl" : "ltr";
          return (
            <li
              key={idx}
              className="rounded-md border border-ink/10 bg-paper/40 p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <select
                  disabled={readOnly}
                  value={item.lang}
                  onChange={(e) =>
                    updateItem(idx, {
                      lang: e.target.value as "en" | "ar",
                    })
                  }
                  className="rounded border border-ink/15 bg-paper px-2 py-1 text-xs"
                >
                  <option value="en">{t("referencesLangEn")}</option>
                  <option value="ar">{t("referencesLangAr")}</option>
                </select>
                <input
                  disabled={readOnly}
                  value={item.doi ?? ""}
                  onChange={(e) =>
                    updateItem(idx, { doi: e.target.value || undefined })
                  }
                  placeholder={t("referencesDoiPlaceholder")}
                  className="flex-1 rounded border border-ink/15 bg-paper px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => removeItem(idx)}
                  className="text-xs text-red-700 hover:underline dark:text-red-300 disabled:opacity-50"
                >
                  {t("referencesRemove")}
                </button>
              </div>
              <textarea
                dir={dir}
                readOnly={readOnly}
                value={item.text}
                onChange={(e) => updateItem(idx, { text: e.target.value })}
                rows={2}
                placeholder={t("referencesEntryPlaceholder")}
                className="mt-2 w-full resize-y rounded border border-ink/20 bg-paper px-2 py-1 text-sm"
              />
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={readOnly}
        onClick={addItem}
        className="mt-3 rounded-md border border-ink/15 bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-accent/40 disabled:opacity-50"
      >
        {t("referencesAdd")}
      </button>
    </SectionFrame>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function SectionFrame({
  label,
  hint,
  headerExtra,
  children,
}: {
  label: string;
  hint?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">
            {label}
          </p>
          {hint ? <p className="text-xs text-ink/55">{hint}</p> : null}
        </div>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}

/**
 * Apply auto-detected direction to a section after a text-content edit, but
 * never override a user's manual choice (`dirSource === 'manual'`).
 */
function applyAutoDir<T extends ConstructorSection>(
  section: T,
  patch: Partial<T>,
): T {
  const merged = { ...section, ...patch } as T;
  if (
    merged.kind === "abstract" ||
    merged.kind === "image" ||
    merged.kind === "table" ||
    merged.kind === "references" ||
    merged.kind === "authors"
  ) {
    // Only auto-detect on flat text sections (title/heading/paragraph).
    return merged;
  }
  if (merged.dirSource === "manual") return merged;
  let textForDetection = "";
  if (merged.kind === "title" || merged.kind === "heading1" || merged.kind === "heading2" || merged.kind === "heading3") {
    textForDetection = (merged as TitleSection | HeadingSection).text;
  } else if (merged.kind === "paragraph") {
    textForDetection = (merged as ParagraphSection).html.replace(/<[^>]+>/g, " ");
  }
  if (!textForDetection.trim()) return merged;
  const detected = detectDirection(textForDetection);
  return { ...merged, dir: detected, dirSource: "auto" } as T;
}

// Re-export to help consumers list section kinds easily
export const SECTION_KIND_ORDER: ConstructorSection["kind"][] = [
  "title",
  "authors",
  "abstract",
  "heading1",
  "heading2",
  "heading3",
  "paragraph",
  "image",
  "table",
  "references",
];

// Helper: produce a fresh blank section of the given kind.
export function createBlankSection(
  kind: ConstructorSection["kind"],
  defaultDir: ConstructorDir,
  options?: { lang?: "en" | "ar" },
): ConstructorSection {
  const id = cryptoId();
  const base = { id, dir: defaultDir, dirSource: "auto" as const };
  switch (kind) {
    case "title":
      return { ...base, kind, text: "", ...(options?.lang ? { lang: options.lang } : {}) };
    case "authors":
      return { ...base, kind, authors: [] };
    case "abstract":
      return {
        ...base,
        kind,
        lang: options?.lang ?? "en",
        text: "",
        keywords: "",
      };
    case "heading1":
    case "heading2":
    case "heading3":
      return { ...base, kind, text: "" };
    case "paragraph":
      return { ...base, kind, html: "<p></p>" };
    case "image":
      return { ...base, kind, fileId: null, altText: "", caption: "" };
    case "table":
      return {
        ...base,
        kind,
        caption: "",
        hasHeaderRow: true,
        rows: [
          ["", ""],
          ["", ""],
        ],
      };
    case "references":
      return { ...base, kind, items: [] };
  }
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type { Editor as TipTapEditor };
