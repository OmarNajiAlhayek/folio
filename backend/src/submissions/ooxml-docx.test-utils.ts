import JSZip from 'jszip';

/** OOXML test helpers — keep dumb (no DSL). */

export async function extractDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const f = zip.file('word/document.xml');
  if (!f) {
    throw new Error('missing word/document.xml');
  }
  return f.async('string');
}

export async function extractStylesXml(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const f = zip.file('word/styles.xml');
  if (!f) return null;
  return f.async('string');
}
