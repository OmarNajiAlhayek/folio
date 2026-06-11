/** Parse JWT-style duration strings (`15m`, `7d`, `1h`, `30s`) to milliseconds. */
export function parseDurationMs(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)(s|m|h|d)$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}
