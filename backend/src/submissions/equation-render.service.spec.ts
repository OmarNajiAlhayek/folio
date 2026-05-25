import sharp from 'sharp';
import { EquationRenderService } from './equation-render.service';

describe('EquationRenderService', () => {
  const service = new EquationRenderService();

  it('renders valid LaTeX to a typeset PNG buffer', async () => {
    const buf = await service.renderLatexToPng('E=mc^2');
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 8).toString('hex')).toMatch(/^89504e47/);
  });

  it('returns raster dimensions for docx sizing', async () => {
    const { widthPx, heightPx } = await service.renderLatexToPngWithSize('E=mc^2');
    expect(widthPx).toBeGreaterThan(50);
    expect(heightPx).toBeGreaterThan(10);
  });

  it('throws on invalid LaTeX', async () => {
    await expect(service.renderLatexToPng('\\badcmd')).rejects.toThrow();
  });

  /** MathJax viewBox uses negative Y; ensure glyphs are not clipped to a bottom band. */
  it('PNG has ink in the upper and lower halves', async () => {
    const { png } = await service.renderLatexToPngWithSize('E=mc^2');
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width ?? 0;
    const h = info.height ?? 0;
    const channels = info.channels ?? 4;
    const mid = Math.floor(h / 2);
    let darkUpper = 0;
    let darkLower = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * channels;
        const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
        if (lum < 200) {
          if (y < mid) darkUpper++;
          else darkLower++;
        }
      }
    }
    expect(darkUpper).toBeGreaterThan(10);
    expect(darkLower).toBeGreaterThan(10);
  });
});
