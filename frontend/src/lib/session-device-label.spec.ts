import { describe, expect, it } from 'vitest';
import { sessionDeviceLabel } from '@/lib/session-device-label';

describe('sessionDeviceLabel', () => {
  it('parses common desktop user agents', () => {
    expect(
      sessionDeviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows');
    expect(
      sessionDeviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      ),
    ).toBe('Safari on macOS');
  });

  it('handles missing user agent', () => {
    expect(sessionDeviceLabel(null)).toBe('Unknown device');
  });
});
