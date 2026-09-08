import {
  escapeXml,
  oaiDatestamp,
  oaiDay,
  parseOaiDate,
  stripXmlIllegalChars,
  xmlEl,
  xmlEls,
  xmlText,
} from './oai-xml';

describe('escapeXml', () => {
  it('escapes all five XML metacharacters', () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;',
    );
  });

  it('escapes ampersands before the entities it introduces', () => {
    // A naive ordering produces &amp;lt; here.
    expect(escapeXml('&<')).toBe('&amp;&lt;');
  });

  it('leaves Arabic text untouched', () => {
    expect(escapeXml('مجلة جامعة دمشق')).toBe('مجلة جامعة دمشق');
  });
});

describe('stripXmlIllegalChars', () => {
  it('drops control characters XML 1.0 cannot represent at all', () => {
    const withVerticalTab = `Title${String.fromCharCode(0x0b)}here`;
    expect(stripXmlIllegalChars(withVerticalTab)).toBe('Titlehere');
  });

  it('keeps tab, newline and carriage return, which are legal', () => {
    expect(stripXmlIllegalChars('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });
});

describe('xmlText', () => {
  it('strips illegal characters and escapes what remains', () => {
    const raw = `A${String.fromCharCode(0x00)} & B`;
    expect(xmlText(raw)).toBe('A &amp; B');
  });
});

describe('xmlEl', () => {
  it('renders an element', () => {
    expect(xmlEl('dc:title', 'Hello')).toBe('<dc:title>Hello</dc:title>');
  });

  it('returns nothing for null, undefined and whitespace', () => {
    expect(xmlEl('dc:title', null)).toBe('');
    expect(xmlEl('dc:title', undefined)).toBe('');
    expect(xmlEl('dc:title', '   ')).toBe('');
  });

  it('trims before emitting', () => {
    expect(xmlEl('dc:title', '  Hello  ')).toBe('<dc:title>Hello</dc:title>');
  });
});

describe('xmlEls', () => {
  it('emits one element per value and skips the empty ones', () => {
    expect(xmlEls('dc:creator', ['A', '', null, 'B'])).toEqual([
      '<dc:creator>A</dc:creator>',
      '<dc:creator>B</dc:creator>',
    ]);
  });
});

describe('oaiDatestamp', () => {
  it('renders whole seconds in UTC with a Z suffix', () => {
    expect(oaiDatestamp(new Date('2026-03-01T09:30:15.482Z'))).toBe(
      '2026-03-01T09:30:15Z',
    );
  });
});

describe('oaiDay', () => {
  it('renders the UTC calendar day', () => {
    expect(oaiDay(new Date('2026-03-01T22:10:00Z'))).toBe('2026-03-01');
  });
});

describe('parseOaiDate', () => {
  it('accepts day granularity', () => {
    expect(parseOaiDate('2026-03-01', 'from')?.toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
  });

  it('treats an until day as inclusive through end of day', () => {
    expect(parseOaiDate('2026-03-01', 'until')?.toISOString()).toBe(
      '2026-03-01T23:59:59.999Z',
    );
  });

  it('accepts second granularity', () => {
    expect(parseOaiDate('2026-03-01T09:30:15Z', 'from')?.toISOString()).toBe(
      '2026-03-01T09:30:15.000Z',
    );
  });

  it('rejects anything else', () => {
    expect(parseOaiDate('01-03-2026', 'from')).toBeNull();
    expect(parseOaiDate('2026-03-01T09:30:15.000Z', 'from')).toBeNull();
    expect(parseOaiDate('not-a-date', 'from')).toBeNull();
  });

  it('rejects a well-formed but impossible date', () => {
    expect(parseOaiDate('2026-13-45', 'from')).toBeNull();
  });
});

describe('stripXmlIllegalChars — XML 1.0 Char production', () => {
  it('drops a lone surrogate, which a control-character class would miss', () => {
    expect(stripXmlIllegalChars(`a${String.fromCharCode(0xd800)}b`)).toBe('ab');
  });

  it('keeps an astral character whose surrogate pair is well formed', () => {
    expect(stripXmlIllegalChars('a\u{1F600}b')).toBe('a\u{1F600}b');
  });

  it('drops U+FFFE and U+FFFF', () => {
    expect(stripXmlIllegalChars('a￾b￿c')).toBe('abc');
  });

  it('returns the original string untouched when nothing is illegal', () => {
    const clean = 'مجلة جامعة دمشق';
    expect(stripXmlIllegalChars(clean)).toBe(clean);
  });
});
