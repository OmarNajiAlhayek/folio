import { describe, expect, it } from 'vitest';
import {
  formatDocxFormatValue,
  groupDocxViolations,
  type DocxFormatViolationView,
} from './docx-format-display';

function violation(
  partial: Partial<DocxFormatViolationView> &
    Pick<DocxFormatViolationView, 'code'>,
): DocxFormatViolationView {
  return {
    message: partial.message ?? partial.code,
    messageAr: partial.messageAr ?? partial.code,
    found: partial.found ?? 'found',
    expected: partial.expected ?? 'expected',
    severity: partial.severity,
    code: partial.code,
  };
}

describe('formatDocxFormatValue', () => {
  it('turns paragraph twips into points', () => {
    expect(formatDocxFormatValue('200 twips', 'PARA_SPACING_AFTER', 'en')).toBe(
      '10 pt',
    );
    expect(formatDocxFormatValue('0 twips', 'PARA_SPACING_BEFORE', 'en')).toBe(
      '0 pt',
    );
    expect(formatDocxFormatValue('160 twips', 'PARA_SPACING_AFTER', 'ar')).toBe(
      '8 نقطة',
    );
  });

  it('turns line-spacing twips into Word names', () => {
    expect(
      formatDocxFormatValue('240 twips (single)', 'LINE_SPACING', 'en'),
    ).toBe('Single');
    expect(formatDocxFormatValue('480 twips', 'LINE_SPACING', 'en')).toBe(
      'Double',
    );
    expect(formatDocxFormatValue('276 twips', 'LINE_SPACING', 'ar')).toBe(
      '1.15',
    );
    expect(formatDocxFormatValue('360 twips', 'LINE_SPACING', 'ar')).toBe(
      '1.5',
    );
    expect(
      formatDocxFormatValue('240 twips (single)', 'LINE_SPACING', 'ar'),
    ).toBe('مفرد');
  });

  it('turns millimeters into centimeters', () => {
    expect(formatDocxFormatValue('30 mm', 'MARGIN_TOP', 'en')).toBe('3 cm');
    expect(formatDocxFormatValue('20 mm', 'MARGIN_BOTTOM', 'ar')).toBe('2 سم');
    expect(formatDocxFormatValue('12.5 mm', 'MARGIN_HEADER', 'en')).toBe(
      '1.25 cm',
    );
    expect(formatDocxFormatValue('6 mm', 'MARGIN_FOOTER', 'ar')).toBe('0.6 سم');
  });

  it('relocalizes values the checker already stored in author units', () => {
    expect(formatDocxFormatValue('3 cm', 'MARGIN_TOP', 'ar')).toBe('3 سم');
    expect(formatDocxFormatValue('11 pt', 'FONT_SIZE_LATIN', 'ar')).toBe(
      '11 نقطة',
    );
    expect(formatDocxFormatValue('Single', 'LINE_SPACING', 'ar')).toBe('مفرد');
    expect(
      formatDocxFormatValue('Exactly 12 pt', 'LINE_SPACING_RULE', 'ar'),
    ).toBe('تماماً 12 نقطة');
    expect(
      formatDocxFormatValue('At least 14 pt', 'LINE_SPACING_RULE', 'en'),
    ).toBe('At least 14 pt');
  });

  it('keeps font names intact and maps short tokens', () => {
    expect(formatDocxFormatValue('Times New Roman', 'FONT_LATIN', 'ar')).toBe(
      'Times New Roman',
    );
    expect(formatDocxFormatValue('not set', 'DIFFERENT_FIRST_PAGE', 'ar')).toBe(
      'غير مفعّل',
    );
    expect(formatDocxFormatValue('Bold', 'TITLE_NOT_BOLD', 'ar')).toBe('غامق');
    expect(formatDocxFormatValue('left', 'LINE_NUMBERS_SIDE', 'en')).toBe(
      'Left',
    );
    expect(formatDocxFormatValue('2 column(s)', 'COLUMN_COUNT', 'en')).toBe(
      '2 columns',
    );
    expect(formatDocxFormatValue('1 column', 'COLUMN_COUNT', 'ar')).toBe(
      'عمود واحد',
    );
    expect(
      formatDocxFormatValue(
        'line numbers (left)',
        'LINE_NUMBERS_MISSING',
        'ar',
      ),
    ).toBe('اليسار');
  });

  it('treats auto as single spacing only for line spacing', () => {
    expect(formatDocxFormatValue('auto', 'LINE_SPACING_RULE', 'en')).toBe(
      'Single',
    );
    expect(formatDocxFormatValue('Auto', 'PARA_SPACING_AFTER', 'ar')).toBe(
      'تلقائي',
    );
  });
});

describe('groupDocxViolations', () => {
  it('groups related codes and keeps a stable order', () => {
    const groups = groupDocxViolations([
      violation({ code: 'FONT_LATIN', severity: 'error' }),
      violation({ code: 'MARGIN_RIGHT', severity: 'error' }),
      violation({ code: 'PARA_SPACING_AFTER', severity: 'error' }),
      violation({ code: 'MARGIN_BOTTOM', severity: 'error' }),
      violation({ code: 'FONT_SIZE_LATIN', severity: 'error' }),
    ]);

    expect(groups.map((group) => group.id)).toEqual([
      'margins',
      'fonts',
      'paragraphSpacing',
    ]);
    expect(groups[0]?.items.map((item) => item.code)).toEqual([
      'MARGIN_BOTTOM',
      'MARGIN_RIGHT',
    ]);
    expect(groups[1]?.items.map((item) => item.code)).toEqual([
      'FONT_LATIN',
      'FONT_SIZE_LATIN',
    ]);
    expect(groups[0]?.hint).toBe('static');
  });

  it('keeps header distance out of the page-margin group', () => {
    const groups = groupDocxViolations([
      violation({ code: 'MARGIN_HEADER', severity: 'warning' }),
      violation({ code: 'MARGIN_TOP', severity: 'error' }),
    ]);
    expect(groups.map((group) => group.id)).toEqual([
      'margins',
      'headerFooter',
    ]);
  });

  it('shows an unknown code as a sentence', () => {
    const groups = groupDocxViolations([
      violation({ code: 'SOMETHING_NEW', message: 'Plain sentence' }),
    ]);
    expect(groups).toEqual([
      {
        id: 'other',
        presentation: 'sentence',
        hint: 'none',
        items: [
          expect.objectContaining({
            code: 'SOMETHING_NEW',
            message: 'Plain sentence',
          }),
        ],
      },
    ]);
  });

  it('uses the stored sentence for an unreadable file', () => {
    const groups = groupDocxViolations([
      violation({ code: 'DOCX_UNREADABLE' }),
    ]);
    expect(groups[0]).toMatchObject({
      id: 'file',
      presentation: 'sentence',
      hint: 'none',
    });
  });
});
