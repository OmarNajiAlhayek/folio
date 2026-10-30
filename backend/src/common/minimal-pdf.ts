/**
 * A one-page PDF a viewer can open. Seed and perf fixtures use this instead of
 * a `%PDF-` header with no body, which downloads but fails to open.
 *
 * Helvetica is WinAnsi only, so characters outside Latin-1 become `?`.
 * Callers that care about the visible title should pass ASCII or Latin-1.
 */

const TITLE_MAX_CHARS = 120;

export function minimalPdf(title: string): Buffer {
  const lines = wrapWinAnsi(winAnsiLiteral(title), 68);
  const commands = ['BT', '/F1 14 Tf', '72 700 Td'];
  lines.forEach((line, index) => {
    if (index > 0) commands.push('0 -20 Td');
    commands.push(`(${line}) Tj`);
  });
  commands.push('ET', '');
  const stream = `${commands.join('\n')}\n`;
  const streamBytes = Buffer.from(stream, 'latin1');

  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>\n', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n', 'latin1'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n',
      'latin1',
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${streamBytes.length} >>\nstream\n`, 'latin1'),
      streamBytes,
      Buffer.from('endstream\n', 'latin1'),
    ]),
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n',
      'latin1',
    ),
  ];

  const header = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
  ]);

  const chunks: Buffer[] = [header];
  const offsets: number[] = [0];
  let cursor = header.length;
  objects.forEach((body, index) => {
    const wrapped = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('endobj\n', 'latin1'),
    ]);
    offsets.push(cursor);
    chunks.push(wrapped);
    cursor += wrapped.length;
  });

  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  xref += `startxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

function wrapWinAnsi(literal: string, width: number): string[] {
  if (literal.length <= width) return [literal];
  const words = literal.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 8);
}

function winAnsiLiteral(title: string): string {
  const clipped = (title.trim() || 'Manuscript').slice(0, TITLE_MAX_CHARS);
  let out = '';
  for (const ch of clipped) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x5c || code === 0x28 || code === 0x29) {
      out += `\\${ch}`;
      continue;
    }
    if (code >= 0x20 && code <= 0xff && code !== 0x7f) {
      out += ch;
      continue;
    }
    out += '?';
  }
  return out;
}
