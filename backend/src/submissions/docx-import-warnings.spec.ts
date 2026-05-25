import { filterDocxImportWarnings } from './docx-import-warnings';

describe('filterDocxImportWarnings', () => {
  it('suppresses common table and caption mammoth warnings', () => {
    const filtered = filterDocxImportWarnings([
      'An unrecognised element was ignored: w:tblPrEx',
      "Unrecognised paragraph style: 'Table Caption' (Style ID: TableCaption)",
      'Image missing alt text',
    ]);
    expect(filtered).toEqual(['Image missing alt text']);
  });
});
