import { describe, expect, it } from 'vitest';
import type { ConstructorContent } from './constructor-content.types';
import {
  detectArticleDir,
  layoutPreviewSections,
  previewCaption,
} from './constructor-preview-layout';

function article(body: string): ConstructorContent {
  return {
    defaultDir: 'ltr',
    sections: [
      { id: 'te', kind: 'title', lang: 'en', text: 'English Title' },
      { id: 'ta', kind: 'title', lang: 'ar', text: 'العنوان' },
      { id: 'au', kind: 'authors', authors: [] },
      { id: 'ae', kind: 'abstract', lang: 'en', text: 'Abstract.', keywords: '' },
      { id: 'aa', kind: 'abstract', lang: 'ar', text: 'ملخص.', keywords: '' },
      { id: 'p', kind: 'paragraph', html: `<p>${body}</p>` },
      { id: 'r', kind: 'references', items: [] },
    ],
  };
}

describe('detectArticleDir', () => {
  it('follows the body text, not the stored default', () => {
    expect(detectArticleDir(article('نص المقالة باللغة العربية'))).toBe('rtl');
    expect(detectArticleDir(article('English article body'))).toBe('ltr');
  });

  it('falls back to the stored default for an empty body', () => {
    expect(detectArticleDir({ defaultDir: 'rtl', sections: [] })).toBe('rtl');
  });
});

describe('layoutPreviewSections', () => {
  it('keeps the author order without a bilingual front matter', () => {
    const content = article('نص');
    expect(layoutPreviewSections(content, false).map((i) => i.key)).toEqual(
      content.sections.map((s) => s.id),
    );
  });

  it('puts the Arabic front matter first for an Arabic article, then English, then the body', () => {
    const items = layoutPreviewSections(article('نص المقالة'), true);
    expect(items.map((i) => i.key)).toEqual([
      'ar:ta',
      'ar:au',
      'ar:aa',
      'en:te',
      'en:au',
      'en:ae',
      'p',
      'r',
    ]);
    expect(items.filter((i) => i.pageBreakBefore).map((i) => i.key)).toEqual([
      'en:te',
      'p',
    ]);
  });

  it('puts the English front matter first for an English article', () => {
    const keys = layoutPreviewSections(article('English body'), true).map(
      (i) => i.key,
    );
    expect(keys.slice(0, 4)).toEqual(['en:te', 'en:au', 'en:ae', 'ar:ta']);
  });
});

describe('previewCaption', () => {
  const words = { rtl: 'الجدول', ltr: 'Table' };

  it('formats template captions with a parenthesised number', () => {
    expect(previewCaption(words, 'parenthesized', 1, 'نتيجة التجربة', 'rtl')).toBe(
      'الجدول (1) نتيجة التجربة',
    );
    expect(previewCaption(words, 'parenthesized', 2, 'Result', 'ltr')).toBe(
      'Table (2) Result',
    );
  });

  it('keeps the colon format by default', () => {
    expect(previewCaption({ rtl: 'Table' }, undefined, 3, 'Data', 'ltr')).toBe(
      'Table 3: Data',
    );
  });
});
