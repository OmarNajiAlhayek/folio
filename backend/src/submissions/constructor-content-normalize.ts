import type { ConstructorContent } from './constructor-content.types';
import { CONSTRUCTOR_SCHEMA_VERSION } from './constructor-content.types';
import { normalizeTableSection } from './constructor-table-utils';
import { sanitizeConstructorContent } from './sanitize-constructor-html';

function usesV2Features(content: ConstructorContent): boolean {
  if (content.footnotes?.length) return true;
  for (const s of content.sections) {
    if (s.kind === 'table') {
      const rows = s.rows ?? [];
      for (const row of rows) {
        for (const cell of row) {
          if (typeof cell !== 'string') {
            if (
              cell.covered ||
              (cell.rowSpan ?? 1) > 1 ||
              (cell.colSpan ?? 1) > 1
            ) {
              return true;
            }
          }
        }
      }
    }
    if ('html' in s && s.html) {
      if (
        s.html.includes('data-file-id') ||
        s.html.includes('data-footnote-id') ||
        /<span[^>]*\sdir=["'](?:ltr|rtl)["']/i.test(s.html)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function normalizeConstructorContent(
  content: ConstructorContent | null | undefined,
): ConstructorContent | null {
  if (!content) return null;
  const sections = content.sections.map((section) => {
    if (section.kind === 'table') {
      return normalizeTableSection(section);
    }
    return section;
  });
  const next: ConstructorContent = {
    ...content,
    sections,
    ...(content.footnotes?.length ? { footnotes: content.footnotes } : {}),
  };
  const sanitized = sanitizeConstructorContent(next);
  if (!sanitized) return null;
  if (usesV2Features(sanitized)) {
    sanitized.schemaVersion = CONSTRUCTOR_SCHEMA_VERSION;
  }
  return sanitized;
}
