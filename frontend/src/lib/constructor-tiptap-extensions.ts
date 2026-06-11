import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Underline from '@tiptap/extension-underline';
import type { Extensions } from '@tiptap/react';
import {
  ConstructorFootnoteRef,
  ConstructorInlineImage,
  ConstructorTextDirection,
} from '@/lib/constructor-tiptap-v2-extensions';

export type ConstructorTipTapVariant = 'full' | 'reference';

export function createConstructorTipTapExtensions(
  variant: ConstructorTipTapVariant = 'full',
): Extensions {
  const lists = variant === 'full';
  const v2 = variant === 'full';
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      link: false,
      strike: false,
      bulletList: lists ? {} : false,
      orderedList: lists ? {} : false,
      listItem: lists ? {} : false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: {
        rel: 'noopener noreferrer',
      },
    }),
    Superscript,
    Subscript,
    ...(variant === 'full' ? [Underline] : []),
    ...(v2
      ? [
          ConstructorTextDirection,
          ConstructorFootnoteRef,
          ConstructorInlineImage,
        ]
      : []),
  ];
}
