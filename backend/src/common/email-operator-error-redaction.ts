const MAX_LEN = 500;

/**
 * Deterministic redaction for operator-facing API samples (not security
 * boundary — full text stays in DB). Keeps error shape readable, e.g.
 * "SMTP [host] refused".
 */
export function redactOperatorErrorMessage(
  input: string | null | undefined,
): string | null {
  if (input == null || input === '') return null;
  let s = input.replace(/\r\n/g, '\n');

  // Stack / frame lines
  s = s.replace(/^\s*at\s+.+$/gm, '[frame]');
  s = s.replace(/^\s*Caused by:\s*.+$/gm, '[frame]');

  // Windows paths
  s = s.replace(/(?:[A-Za-z]:)?(?:\\[\w.-]+)+\\?/g, '[path]');

  // Unix-ish path segments (avoid single slashes in words)
  s = s.replace(/(?:\/[\w.@~-]+){2,}\/?/g, '[path]');

  // Hostnames / FQDNs (conservative: require a dot + TLD)
  s = s.replace(
    /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\b/g,
    '[host]',
  );

  // IPv4
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[host]');

  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > MAX_LEN) {
    s = `${s.slice(0, MAX_LEN)}…`;
  }
  return s;
}
