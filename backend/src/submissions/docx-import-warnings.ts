/**
 * Mammoth emits many warnings for normal Word OOXML (table extensions, caption
 * styles, etc.). Suppress ones that do not indicate lost manuscript content.
 */
const SUPPRESSED_WARNING_PATTERNS: RegExp[] = [
  /unrecognised element was ignored:\s*w:tblPrEx/i,
  /unrecognised element was ignored:\s*w:tbl(?:Pr|Grid|Borders)/i,
  /unrecognised paragraph style:.*table\s+caption/i,
  /unrecognised paragraph style:.*caption/i,
  /unrecognised paragraph style:.*heading/i,
  /unrecognised run style:/i,
];

export function filterDocxImportWarnings(messages: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of messages) {
    const message = raw.trim();
    if (!message) continue;
    if (SUPPRESSED_WARNING_PATTERNS.some((re) => re.test(message))) continue;
    if (seen.has(message)) continue;
    seen.add(message);
    out.push(message);
  }
  return out.slice(0, 20);
}
