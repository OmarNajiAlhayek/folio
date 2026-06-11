'use client';

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import type { MouseEvent, ReactNode } from 'react';
import type { ConstructorTipTapVariant } from '@/lib/constructor-tiptap-extensions';
import type { ConstructorFootnote } from '@/lib/constructor-content.types';
import { apiUpload } from '@/lib/api';
import { SimpleTooltip } from '@/components/ui/tooltip';

function keepEditorSelection(e: MouseEvent) {
  e.preventDefault();
}

function ToolbarBtn({
  title,
  className,
  children,
  ...props
}: {
  title: string;
  className?: string;
  children: ReactNode;
} & React.ComponentPropsWithoutRef<'button'>) {
  return (
    <SimpleTooltip content={title}>
      <button type="button" className={className} {...props}>
        {children}
      </button>
    </SimpleTooltip>
  );
}

export function ConstructorRichTextToolbar({
  editor,
  disabled,
  variant = 'full',
  slug,
  footnotes = [],
  onFootnotesChange,
}: {
  editor: Editor;
  disabled?: boolean;
  variant?: ConstructorTipTapVariant;
  slug?: string;
  footnotes?: ConstructorFootnote[];
  onFootnotesChange?: (next: ConstructorFootnote[]) => void;
}) {
  const t = useTranslations('ConstructorEditor');
  const btn =
    'rounded-lg border border-ink/10 bg-paper p-1.5 text-xs text-ink/70 hover:bg-ink/5 hover:border-accent/40 hover:text-accent disabled:opacity-30 disabled:pointer-events-none transition-all duration-200 cursor-pointer shadow-3xs hover:shadow-2xs';
  const active =
    'border-accent/40 bg-accent/10 text-accent font-bold shadow-2xs';

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      superscript: ed.isActive('superscript'),
      subscript: ed.isActive('subscript'),
      link: ed.isActive('link'),
      bulletList: ed.isActive('bulletList'),
      orderedList: ed.isActive('orderedList'),
      canUndo: ed.can().undo(),
      canRedo: ed.can().redo(),
    }),
  });

  const inlineImageInputId = 'constructor-inline-image-input';

  async function insertInlineImage(file: File | undefined) {
    if (!file || !slug) return;
    const row = (await apiUpload(
      `/submissions/${encodeURIComponent(slug)}/files`,
      file,
      { kind: 'figure' },
    )) as { id: string };
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'constructorInlineImage',
        attrs: { fileId: row.id, alt: file.name },
      })
      .run();
  }

  function toggleTextDirection(dir: 'ltr' | 'rtl') {
    editor.chain().focus().toggleMark('textDirection', { dir }).run();
  }

  function insertFootnote(placement: 'footnote' | 'endnote') {
    if (!onFootnotesChange) return;
    const id = crypto.randomUUID();
    const text = window.prompt(t('footnoteBodyPrompt'), '') ?? '';
    if (!text.trim()) return;
    const nextFootnotes = [
      ...footnotes,
      { id, text: `<p>${text.trim()}</p>`, placement },
    ];
    onFootnotesChange(nextFootnotes);
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: ' ',
      })
      .setMark('footnoteRef', { footnoteId: id })
      .insertContent({ type: 'text', text: ' ' })
      .run();
  }

  function toggleLink() {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt(t('toolbarLinkPrompt'), prev ?? 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url.trim() })
      .run();
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-ink/10 bg-surface/50 p-2 shadow-3xs backdrop-blur-[2px]">
      {variant === 'full' ? (
        <ToolbarBtn
          disabled={disabled}
          data-testid="constructor-toolbar-bold"
          onMouseDown={keepEditorSelection}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${btn} ${state.bold ? active : ''}`}
          title={t('toolbarBold')}
        >
          <BoldIcon />
        </ToolbarBtn>
      ) : null}
      <ToolbarBtn
        disabled={disabled}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${btn} ${state.italic ? active : ''}`}
        title={t('toolbarItalic')}
      >
        <ItalicIcon />
      </ToolbarBtn>
      {variant === 'full' ? (
        <ToolbarBtn
          disabled={disabled}
          onMouseDown={keepEditorSelection}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${btn} ${state.underline ? active : ''}`}
          title={t('toolbarUnderline')}
        >
          <UnderlineIcon />
        </ToolbarBtn>
      ) : null}
      <ToolbarBtn
        disabled={disabled}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        className={`${btn} ${state.superscript ? active : ''}`}
        title={t('toolbarSuperscript')}
      >
        <SuperscriptIcon />
      </ToolbarBtn>
      <ToolbarBtn
        disabled={disabled}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        className={`${btn} ${state.subscript ? active : ''}`}
        title={t('toolbarSubscript')}
      >
        <SubscriptIcon />
      </ToolbarBtn>
      <ToolbarBtn
        disabled={disabled}
        onMouseDown={keepEditorSelection}
        onClick={toggleLink}
        className={`${btn} ${state.link ? active : ''}`}
        title={t('toolbarLink')}
      >
        <LinkIcon />
      </ToolbarBtn>
      {variant === 'full' ? (
        <>
          <ToolbarBtn
            disabled={disabled || !slug}
            onMouseDown={keepEditorSelection}
            onClick={() => toggleTextDirection('ltr')}
            className={btn}
            title={t('toolbarDirLtr')}
          >
            LTR
          </ToolbarBtn>
          <ToolbarBtn
            disabled={disabled || !slug}
            onMouseDown={keepEditorSelection}
            onClick={() => toggleTextDirection('rtl')}
            className={btn}
            title={t('toolbarDirRtl')}
          >
            RTL
          </ToolbarBtn>
          <ToolbarBtn
            disabled={disabled || !onFootnotesChange}
            data-testid="constructor-toolbar-footnote"
            onMouseDown={keepEditorSelection}
            onClick={() => insertFootnote('footnote')}
            className={btn}
            title={t('toolbarFootnote')}
          >
            Fn
          </ToolbarBtn>
          <ToolbarBtn
            disabled={disabled || !onFootnotesChange}
            onMouseDown={keepEditorSelection}
            onClick={() => insertFootnote('endnote')}
            className={btn}
            title={t('toolbarEndnote')}
          >
            En
          </ToolbarBtn>
          <input
            id={inlineImageInputId}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            disabled={disabled || !slug}
            onChange={(e) => {
              void insertInlineImage(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <label
            htmlFor={inlineImageInputId}
            className={`${btn} inline-flex items-center ${disabled || !slug ? 'pointer-events-none opacity-30' : 'cursor-pointer'}`}
            title={t('toolbarInlineImage')}
          >
            Img
          </label>
          <span className="mx-1.5 h-4 w-px bg-ink/10" />
          <ToolbarBtn
            disabled={disabled}
            onMouseDown={keepEditorSelection}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`${btn} ${state.bulletList ? active : ''}`}
            title={t('toolbarBulletList')}
          >
            <BulletListIcon />
          </ToolbarBtn>
          <ToolbarBtn
            disabled={disabled}
            onMouseDown={keepEditorSelection}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`${btn} ${state.orderedList ? active : ''}`}
            title={t('toolbarOrderedList')}
          >
            <OrderedListIcon />
          </ToolbarBtn>
        </>
      ) : null}
      <span className="mx-1.5 h-4 w-px bg-ink/10" />
      <ToolbarBtn
        disabled={disabled || !state.canUndo}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().undo().run()}
        className={btn}
        title={t('toolbarUndo')}
      >
        <UndoIcon />
      </ToolbarBtn>
      <ToolbarBtn
        disabled={disabled || !state.canRedo}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().redo().run()}
        className={btn}
        title={t('toolbarRedo')}
      >
        <RedoIcon />
      </ToolbarBtn>
    </div>
  );
}

function BoldIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3.75h6c2.5 0 4.5 1.5 4.5 3.75s-2 3.75-4.5 3.75H6.75M6.75 11.25h7.5c2.5 0 4.5 2 4.5 4.5s-2 4.5-4.5 4.5h-7.5V3.75z"
      />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 4h-9M14 20H5M15 4L9 20"
      />
    </svg>
  );
}

function UnderlineIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 4v7a6 6 0 01-12 0V4M4 20h16"
      />
    </svg>
  );
}

function SuperscriptIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 4h-9M14 20H5M15 4L9 20M19.5 4.5l-5 5"
      />
    </svg>
  );
}

function SubscriptIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 4h-9M14 20H5M15 4L9 20M19.5 19.5l-5-5"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 016.364 6.364l-3 3a4.5 4.5 0 01-6.364-6.364l1.757-1.757m-4.95 4.95a4.5 4.5 0 010-6.364l3-3a4.5 4.5 0 116.364 6.364l-1.757 1.757"
      />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3 5h2v4M3 9h4M3 13.5h3.5a1.5 1.5 0 011.5 1.5v0a1.5 1.5 0 01-1.5 1.5H3"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3"
      />
    </svg>
  );
}
