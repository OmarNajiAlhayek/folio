"use client";

import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import type { ConstructorTipTapVariant } from "@/lib/constructor-tiptap-extensions";

export function ConstructorRichTextToolbar({
  editor,
  disabled,
  variant = "full",
}: {
  editor: Editor;
  disabled?: boolean;
  variant?: ConstructorTipTapVariant;
}) {
  const t = useTranslations("ConstructorEditor");
  const btn =
    "rounded-lg border border-ink/10 bg-paper p-1.5 text-xs text-ink/70 hover:bg-ink/5 hover:border-accent/40 hover:text-accent disabled:opacity-30 disabled:pointer-events-none transition-all duration-200 cursor-pointer shadow-3xs hover:shadow-2xs";
  const active = "border-accent/40 bg-accent/10 text-accent font-bold shadow-2xs";

  function toggleLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("toolbarLinkPrompt"), prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-ink/10 bg-surface/50 p-2 shadow-3xs backdrop-blur-[2px]">
      {variant === "full" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${btn} ${editor.isActive("bold") ? active : ""}`}
          title={t("toolbarBold")}
        >
          <BoldIcon />
        </button>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${btn} ${editor.isActive("italic") ? active : ""}`}
        title={t("toolbarItalic")}
      >
        <ItalicIcon />
      </button>
      {variant === "full" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${btn} ${editor.isActive("underline") ? active : ""}`}
          title={t("toolbarUnderline")}
        >
          <UnderlineIcon />
        </button>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        className={`${btn} ${editor.isActive("superscript") ? active : ""}`}
        title={t("toolbarSuperscript")}
      >
        <SuperscriptIcon />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        className={`${btn} ${editor.isActive("subscript") ? active : ""}`}
        title={t("toolbarSubscript")}
      >
        <SubscriptIcon />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleLink}
        className={`${btn} ${editor.isActive("link") ? active : ""}`}
        title={t("toolbarLink")}
      >
        <LinkIcon />
      </button>
      {variant === "full" ? (
        <>
          <span className="mx-1.5 h-4 w-px bg-ink/10" />
          <button
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`${btn} ${editor.isActive("bulletList") ? active : ""}`}
            title={t("toolbarBulletList")}
          >
            <BulletListIcon />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`${btn} ${editor.isActive("orderedList") ? active : ""}`}
            title={t("toolbarOrderedList")}
          >
            <OrderedListIcon />
          </button>
        </>
      ) : null}
      <span className="mx-1.5 h-4 w-px bg-ink/10" />
      <button
        type="button"
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
        className={btn}
        title={t("toolbarUndo")}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
        className={btn}
        title={t("toolbarRedo")}
      >
        <RedoIcon />
      </button>
    </div>
  );
}

function BoldIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3.75h6c2.5 0 4.5 1.5 4.5 3.75s-2 3.75-4.5 3.75H6.75M6.75 11.25h7.5c2.5 0 4.5 2 4.5 4.5s-2 4.5-4.5 4.5h-7.5V3.75z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 4h-9M14 20H5M15 4L9 20" />
    </svg>
  );
}

function UnderlineIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 4v7a6 6 0 01-12 0V4M4 20h16" />
    </svg>
  );
}

function SuperscriptIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 4h-9M14 20H5M15 4L9 20M19.5 4.5l-5 5" />
    </svg>
  );
}

function SubscriptIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 4h-9M14 20H5M15 4L9 20M19.5 19.5l-5-5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 016.364 6.364l-3 3a4.5 4.5 0 01-6.364-6.364l1.757-1.757m-4.95 4.95a4.5 4.5 0 010-6.364l3-3a4.5 4.5 0 116.364 6.364l-1.757 1.757" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3 5h2v4M3 9h4M3 13.5h3.5a1.5 1.5 0 011.5 1.5v0a1.5 1.5 0 01-1.5 1.5H3" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
    </svg>
  );
}
