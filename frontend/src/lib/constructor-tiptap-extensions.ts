import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import type { Extensions } from "@tiptap/react";

export type ConstructorTipTapVariant = "full" | "reference";

export function createConstructorTipTapExtensions(
  variant: ConstructorTipTapVariant = "full",
): Extensions {
  const lists = variant === "full";
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      link: false,
      strike: false,
      bulletList: lists,
      orderedList: lists,
      listItem: lists,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ["http", "https", "mailto"],
      HTMLAttributes: {
        rel: "noopener noreferrer",
      },
    }),
    Superscript,
    Subscript,
  ];
}
