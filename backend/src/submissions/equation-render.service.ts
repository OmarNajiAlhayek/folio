import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import katex from 'katex';
import sharp from 'sharp';

@Injectable()
export class EquationRenderService {
  private readonly cache = new Map<string, Buffer>();

  /**
   * Renders LaTeX to PNG for Word embedding.
   * Validates with KaTeX, then rasterizes a centered SVG text label (v1 — not full math layout).
   */
  async renderLatexToPng(latex: string): Promise<Buffer> {
    const trimmed = latex.trim();
    const key = createHash('sha256').update(trimmed).digest('hex');
    const cached = this.cache.get(key);
    if (cached) return cached;

    katex.renderToString(trimmed, {
      throwOnError: true,
      displayMode: true,
    });

    const escaped = trimmed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120">
      <rect width="100%" height="100%" fill="white"/>
      <text x="320" y="64" text-anchor="middle" font-size="28" font-family="Cambria Math, Times New Roman, serif">${escaped}</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    this.cache.set(key, png);
    return png;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
