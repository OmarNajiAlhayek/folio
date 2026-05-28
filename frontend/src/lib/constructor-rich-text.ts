import { sanitizeConstructorTipTapHtml } from "@/lib/sanitize-constructor-html";

const ALLOWED_LINK_PROTOCOLS = /^(https?:|mailto:)/i;

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToParagraphHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "<p></p>";
  return `<p>${escapeHtmlText(trimmed)}</p>`;
}

export function constructorHtmlToPlain(html: string): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeConstructorLinkHref(
  href: string | undefined | null,
): string | null {
  const trimmed = (href ?? "").trim();
  if (!trimmed) return null;
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProto);
    if (!ALLOWED_LINK_PROTOCOLS.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface ReferenceEntryLike {
  html?: string;
  text?: string;
}

export function resolveReferenceEntryHtml(entry: ReferenceEntryLike): string {
  const raw = entry.html?.trim()
    ? entry.html
    : entry.text?.trim()
      ? plainTextToParagraphHtml(entry.text)
      : "<p></p>";
  return sanitizeConstructorTipTapHtml(raw);
}

export function referenceEntryHasContent(entry: ReferenceEntryLike): boolean {
  return constructorHtmlToPlain(resolveReferenceEntryHtml(entry)).length > 0;
}

export function referenceEntrySortKey(entry: ReferenceEntryLike): string {
  return constructorHtmlToPlain(resolveReferenceEntryHtml(entry));
}
