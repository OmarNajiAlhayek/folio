import { describe, expect, it } from 'vitest';
import {
  DAMASCUS_PREVIEW_THEME_FALLBACK,
  resolveCitationStyle,
} from './manuscript-styles-catalog';

describe('resolveCitationStyle', () => {
  const theme = DAMASCUS_PREVIEW_THEME_FALLBACK;

  it('uses Vancouver for the medical journal', () => {
    expect(resolveCitationStyle(theme, 'medj')).toBe('vancouver');
  });

  it('uses APA for every other journal', () => {
    expect(resolveCitationStyle(theme, 'engj')).toBe('apa');
    expect(resolveCitationStyle(theme, 'artsj')).toBe('apa');
  });

  it('falls back to the theme default for an unknown journal', () => {
    expect(resolveCitationStyle(theme, null)).toBe('apa');
  });

  it('treats a theme without a rule as APA everywhere', () => {
    const { citationStyles: _rule, ...withoutRule } = theme;
    void _rule;
    expect(resolveCitationStyle(withoutRule, 'medj')).toBe('apa');
  });
});
