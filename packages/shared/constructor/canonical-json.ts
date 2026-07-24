/**
 * Stable JSON for constructor content hashing. Sorts object keys recursively so
 * logically identical content produces the same string in Node and the browser.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const pairs = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`,
  );
  return `{${pairs.join(',')}}`;
}

export function canonicalConstructorContentJson(
  content: unknown,
): string | null {
  if (!content || typeof content !== 'object') return null;
  return canonicalJsonStringify(content);
}
