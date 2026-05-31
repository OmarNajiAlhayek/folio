import { redactAiServiceLogMessage } from './ai-log-redaction';

describe('redactAiServiceLogMessage', () => {
  it('redacts long quoted strings', () => {
    const long = 'a'.repeat(120);
    const out = redactAiServiceLogMessage(`failed: "${long}"`);
    expect(out).toContain('[redacted]');
    expect(out).not.toContain(long);
  });

  it('truncates very long messages', () => {
    const out = redactAiServiceLogMessage('x'.repeat(500));
    expect(out.length).toBeLessThanOrEqual(201);
    expect(out.endsWith('…')).toBe(true);
  });

  it('keeps short operational messages', () => {
    expect(redactAiServiceLogMessage('connection refused')).toBe(
      'connection refused',
    );
  });
});
