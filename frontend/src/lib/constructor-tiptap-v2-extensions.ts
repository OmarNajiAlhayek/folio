import { Mark, mergeAttributes, Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';

/** Inline direction mark — renders as `<span dir="ltr|rtl">`. */
export const ConstructorTextDirection = Mark.create({
  name: 'textDirection',
  addAttributes() {
    return {
      dir: {
        default: 'ltr',
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr',
        renderHTML: (attrs) => ({ dir: attrs.dir }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[dir]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

/** Footnote reference — `<sup data-footnote-id="...">`. */
export const ConstructorFootnoteRef = Mark.create({
  name: 'footnoteRef',
  inclusive: false,
  addAttributes() {
    return {
      footnoteId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-footnote-id'),
        renderHTML: (attrs) =>
          attrs.footnoteId
            ? {
                'data-footnote-id': attrs.footnoteId,
                class: 'folio-footnote-ref',
              }
            : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'sup[data-footnote-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes), 0];
  },
});

/** Inline image stored by server file id — never base64 `src`. */
export const ConstructorInlineImage = Image.extend({
  name: 'constructorInlineImage',
  inline: true,
  group: 'inline',
  atom: true,
  addAttributes() {
    return {
      fileId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-file-id'),
        renderHTML: (attrs) =>
          attrs.fileId
            ? {
                'data-file-id': attrs.fileId,
                class: 'folio-inline-image',
                alt: attrs.alt ?? '',
              }
            : {},
      },
      alt: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('alt') ?? '',
        renderHTML: (attrs) => ({ alt: attrs.alt ?? '' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'img[data-file-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },
}) as Node;
