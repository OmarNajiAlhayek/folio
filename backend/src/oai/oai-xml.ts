/**
 * XML primitives for the OAI-PMH endpoint.
 *
 * Every string that reaches these helpers is author-supplied — titles,
 * abstracts, keywords, affiliations. A single unescaped `&` makes the whole
 * response non-well-formed, and a harvester rejects the *document*, not the
 * offending record, so one bad article would silently stop the entire archive
 * from being indexed. Escaping is therefore centralised and never optional.
 */

/**
 * True for a code point the XML 1.0 `Char` production allows.
 *
 *   Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] |
 *            [#x10000-#x10FFFF]
 *
 * Written as an allow-list rather than a deny-regex for two reasons: it is the
 * spec's own formulation, and it rejects lone surrogates and U+FFFE/U+FFFF,
 * which a hand-written control-character class quietly lets through.
 */
function isXmlChar(cp: number): boolean {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return true;
  if (cp >= 0x20 && cp <= 0xd7ff) return true;
  if (cp >= 0xe000 && cp <= 0xfffd) return true;
  return cp >= 0x10000 && cp <= 0x10ffff;
}

/**
 * Drops characters XML 1.0 forbids outright, which no amount of
 * entity-escaping makes legal — `&#11;` is exactly as invalid as a raw U+000B.
 * They reach us through text pasted out of word processors.
 */
export function stripXmlIllegalChars(value: string): string {
  let out = '';
  let dirty = false;
  for (const ch of value) {
    // Iterating a string yields whole code points, so a surrogate pair arrives
    // as one unit and a *lone* surrogate arrives alone — and is dropped.
    if (isXmlChar(ch.codePointAt(0) as number)) {
      out += ch;
    } else {
      dirty = true;
    }
  }
  return dirty ? out : value;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** The only way text should ever enter the document. */
export function xmlText(value: string): string {
  return escapeXml(stripXmlIllegalChars(value));
}

/** `<tag>text</tag>`, or '' when there is nothing worth emitting. */
export function xmlEl(tag: string, value: string | null | undefined): string {
  if (value == null) return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return `<${tag}>${xmlText(trimmed)}</${tag}>`;
}

/** One element per value, skipping blanks — `dc:creator`, `dc:subject`, … */
export function xmlEls(
  tag: string,
  values: readonly (string | null | undefined)[],
): string[] {
  return values.map((v) => xmlEl(tag, v)).filter((s) => s !== '');
}

/**
 * OAI granularity `YYYY-MM-DDThh:mm:ssZ`. Always UTC, always whole seconds —
 * the value is declared in `Identify` and harvesters compare it literally, so
 * it must not vary with server locale or drift into milliseconds.
 */
export function oaiDatestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** `YYYY-MM-DD`, for `dc:date`. */
export function oaiDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parses an OAI `from`/`until` argument, which may use either granularity.
 * `until` is inclusive, so a day-only value covers through the end of that day.
 */
export function parseOaiDate(
  raw: string,
  bound: 'from' | 'until',
): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(
      bound === 'until' ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`,
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
