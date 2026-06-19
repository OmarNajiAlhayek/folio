'use client';

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import type { MouseEvent, ReactNode } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Superscript,
  Subscript,
  Link,
  List,
  ListOrdered,
  Undo,
  Redo,
} from 'lucide-react';
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
          <Bold className="size-3.5" aria-hidden />
        </ToolbarBtn>
      ) : null}
      <ToolbarBtn
        disabled={disabled}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${btn} ${state.italic ? active : ''}`}
        title={t('toolbarItalic')}
      >
        <Italic className="size-3.5" aria-hidden />
      </ToolbarBtn>
      {variant === 'full' ? (
        <ToolbarBtn
          disabled={disabled}
          onMouseDown={keepEditorSelection}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${btn} ${state.underline ? active : ''}`}
          title={t('toolbarUnderline')}
        >
          <Underline className="size-3.5" aria-hidden />
        </ToolbarBtn>
      ) : null}
      <ToolbarBtn
        disabled={disabled}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        className={`${btn} ${state.superscript ? active : ''}`}
        title={t('toolbarSuperscript')}
      >
        <Superscript className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        disabled={disabled}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        className={`${btn} ${state.subscript ? active : ''}`}
        title={t('toolbarSubscript')}
      >
        <Subscript className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        disabled={disabled}
        onMouseDown={keepEditorSelection}
        onClick={toggleLink}
        className={`${btn} ${state.link ? active : ''}`}
        title={t('toolbarLink')}
      >
        <Link className="size-3.5" aria-hidden />
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
            <List className="size-3.5" aria-hidden />
          </ToolbarBtn>
          <ToolbarBtn
            disabled={disabled}
            onMouseDown={keepEditorSelection}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`${btn} ${state.orderedList ? active : ''}`}
            title={t('toolbarOrderedList')}
          >
            <ListOrdered className="size-3.5" aria-hidden />
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
        <Undo className="size-3.5" aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        disabled={disabled || !state.canRedo}
        onMouseDown={keepEditorSelection}
        onClick={() => editor.chain().focus().redo().run()}
        className={btn}
        title={t('toolbarRedo')}
      >
        <Redo className="size-3.5" aria-hidden />
      </ToolbarBtn>
    </div>
  );
}
