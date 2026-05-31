const MAX_LEN = 200;
const LONG_STRING_THRESHOLD = 80;

/**
 * Truncate and strip long string literals from ai-service gRPC error text so
 * manuscript fragments echoed by the server are not written to Nest logs.
 */
export function redactAiServiceLogMessage(
  input: string | null | undefined,
): string {
  if (input == null || input === '') {
    return '';
  }
  let s = input.replace(/\r\n/g, '\n').trim();
  s = s.replace(/"([^"\\]|\\.)*"/g, (match) =>
    match.length > LONG_STRING_THRESHOLD + 2 ? '"[redacted]"' : match,
  );
  s = s.replace(/'([^'\\]|\\.)*'/g, (match) =>
    match.length > LONG_STRING_THRESHOLD + 2 ? "'[redacted]'" : match,
  );
  if (s.length > MAX_LEN) {
    return `${s.slice(0, MAX_LEN)}…`;
  }
  return s;
}
