import DOMPurify from "dompurify";
import type {
  ConstructorContent,
  ConstructorSection,
  RichTextBlockKind,
} from "@/lib/constructor-content.types";

/**
 * TipTap paragraph / rich-text HTML allowlist.
 * Keep in sync with `backend/src/submissions/sanitize-constructor-html.ts`.
 */
export const CONSTRUCTOR_TIPTAP_ALLOWED_TAGS = [
  "p",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "br",
] as const;

const RICH_TEXT_BLOCK_KINDS = new Set<RichTextBlockKind>([
  "acknowledgments",
  "funding",
  "conflictOfInterest",
  "dataAvailability",
]);

/** MathML + structure tags KaTeX may emit (DOMPurify forbids many by default). */
const KATEX_EXTRA_TAGS = [
  "math",
  "semantics",
  "annotation",
  "mrow",
  "mi",
  "mo",
  "mn",
  "msup",
  "msub",
  "msubsup",
  "mfrac",
  "mroot",
  "msqrt",
  "mtext",
  "mtable",
  "mtr",
  "mtd",
  "munder",
  "mover",
  "munderover",
  "mpadded",
  "mphantom",
  "menclose",
  "mstyle",
  "mspace",
] as const;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function sectionHasHtmlField(
  section: ConstructorSection,
): section is ConstructorSection & { html: string } {
  return (
    section.kind === "paragraph" ||
    RICH_TEXT_BLOCK_KINDS.has(section.kind as RichTextBlockKind)
  );
}

export function sanitizeConstructorTipTapHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS: [...CONSTRUCTOR_TIPTAP_ALLOWED_TAGS],
    ALLOWED_ATTR: [],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  if (!sanitized || stripHtml(sanitized).length === 0) {
    return "<p></p>";
  }
  return sanitized;
}

export function sanitizeConstructorContent(
  content: ConstructorContent,
): ConstructorContent {
  return {
    ...content,
    sections: content.sections.map((section) => {
      if (!sectionHasHtmlField(section)) return section;
      return {
        ...section,
        html: sanitizeConstructorTipTapHtml(section.html),
      };
    }),
  };
}

let katexSanitizerHooksInstalled = false;

function ensureKatexSanitizerHooks(): void {
  if (katexSanitizerHooksInstalled || typeof window === "undefined") return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName?.toLowerCase() === "annotation") {
      node.setAttribute("encoding", "application/x-tex");
    }
  });
  katexSanitizerHooksInstalled = true;
}

export function sanitizeKatexPreviewHtml(html: string): string {
  ensureKatexSanitizerHooks();
  return DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS: ["span", "div", ...KATEX_EXTRA_TAGS],
    ALLOWED_ATTR: ["class", "aria-hidden", "encoding", "xmlns"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "script"],
  });
}
