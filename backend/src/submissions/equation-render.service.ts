import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import katex from 'katex';
import sharp from 'sharp';

const requireMathJax = createRequire(__filename);

/** Bump when rasterization changes so in-memory cache cannot serve stale PNGs. */
const EQUATION_PNG_CACHE_VERSION = 'v6-katex-16pt';

let cachedKatexCss: string | undefined;

const MAX_EQUATION_WIDTH_PX = 500;

type CachedEquation = {
  png: Buffer;
  widthPx: number;
  heightPx: number;
};

type MathJaxModule = {
  init: (config: { loader: { load: string[] } }) => Promise<unknown>;
  tex2svg: (tex: string, options: { display: boolean }) => unknown;
  startup: {
    adaptor: { serializeXML: (node: unknown) => string };
  };
};

function getMathJax(): MathJaxModule {
  return requireMathJax('mathjax') as MathJaxModule;
}

let mathJaxReady: Promise<void> | undefined;

function ensureMathJax(): Promise<void> {
  if (!mathJaxReady) {
    const MathJax = getMathJax();
    mathJaxReady = MathJax.init({
      loader: { load: ['input/tex', 'output/svg'] },
    }).then(() => undefined);
  }
  return mathJaxReady;
}

@Injectable()
export class EquationRenderService implements OnModuleDestroy {
  private readonly logger = new Logger(EquationRenderService.name);
  private readonly cache = new Map<string, CachedEquation>();
  private browserInit: Promise<import('playwright').Browser> | null = null;
  private browser: import('playwright').Browser | null = null;

  /**
   * Renders LaTeX to PNG for Word embedding.
   * Primary path: KaTeX + headless browser (matches constructor preview).
   * Fallback: MathJax → SVG → sharp when Playwright is unavailable.
   */
  async renderLatexToPng(latex: string): Promise<Buffer> {
    const { png } = await this.renderLatexToPngWithSize(latex);
    return png;
  }

  async renderLatexToPngWithSize(
    latex: string,
  ): Promise<{ png: Buffer; widthPx: number; heightPx: number }> {
    const trimmed = latex.trim();
    const key = createHash('sha256')
      .update(`${EQUATION_PNG_CACHE_VERSION}\0${trimmed}`)
      .digest('hex');
    const cached = this.cache.get(key);
    if (cached) return cached;

    katex.renderToString(trimmed, { throwOnError: true, displayMode: true });

    const png = await this.rasterize(trimmed);
    const meta = await sharp(png).metadata();
    const widthPx = meta.width ?? MAX_EQUATION_WIDTH_PX;
    const heightPx = meta.height ?? Math.round(widthPx / 5);
    const entry: CachedEquation = { png, widthPx, heightPx };
    this.cache.set(key, entry);
    return entry;
  }

  clearCache(): void {
    this.cache.clear();
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
    this.browserInit = null;
  }

  private async rasterize(trimmed: string): Promise<Buffer> {
    if (process.env.EQUATION_RENDER_MATHJAX_ONLY === '1') {
      return rasterizeMathJaxToPng(trimmed);
    }
    try {
      return await this.rasterizeKatexPreviewPng(trimmed);
    } catch (err) {
      this.logger.warn(
        `KaTeX preview rasterization failed (${err instanceof Error ? err.message : err}); using MathJax fallback`,
      );
      return rasterizeMathJaxToPng(trimmed);
    }
  }

  /** Inlined so Playwright does not rely on file:// stylesheet loading (Windows-safe). */
  private katexCssInline(): string {
    if (!cachedKatexCss) {
      const cssPath = require.resolve('katex/dist/katex.min.css');
      cachedKatexCss = readFileSync(cssPath, 'utf8');
    }
    return cachedKatexCss;
  }

  private async getBrowser(): Promise<import('playwright').Browser> {
    if (!this.browserInit) {
      this.browserInit = this.launchBrowser();
    }
    return this.browserInit;
  }

  private async launchBrowser(): Promise<import('playwright').Browser> {
    const { chromium } = await import('playwright');
    const attempts: Array<{ channel?: 'msedge' | 'chrome' }> =
      process.platform === 'win32'
        ? [{ channel: 'msedge' }, { channel: 'chrome' }, {}]
        : [{}];
    let last: unknown;
    for (const opts of attempts) {
      try {
        const browser = await chromium.launch({
          headless: true,
          ...opts,
        });
        this.browser = browser;
        return browser;
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }

  /** Same KaTeX + CSS as the constructor UI, captured as PNG. */
  private async rasterizeKatexPreviewPng(trimmed: string): Promise<Buffer> {
    const markup = katex.renderToString(trimmed, {
      throwOnError: true,
      displayMode: true,
    });
    const browser = await this.getBrowser();
    const page = await browser.newPage({
      deviceScaleFactor: 2,
      viewport: { width: 1280, height: 400 },
    });
    try {
      const katexCss = this.katexCssInline();
      await page.setContent(
        `<!DOCTYPE html><html><head>
          <meta charset="utf-8"/>
          <style>${katexCss}</style>
          <style>
            html, body { margin: 0; padding: 8px; background: #fff; }
            body { display: flex; justify-content: center; align-items: center; }
            .katex-display { margin: 0; font-size: 16pt; }
            /* MathML is for screen readers only — must not appear in PNG captures. */
            .katex-mathml {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              width: 0 !important;
              overflow: hidden !important;
              position: absolute !important;
            }
          </style>
        </head><body>${markup}</body></html>`,
        { waitUntil: 'load' },
      );
      const target = page.locator('.katex-html').first();
      await target.waitFor({ state: 'visible', timeout: 10_000 });
      const raw = await target.screenshot({
        type: 'png',
        omitBackground: false,
      });
      return await sharp(raw).trim({ threshold: 12 }).png().toBuffer();
    } finally {
      await page.close();
    }
  }
}

async function rasterizeMathJaxToPng(trimmed: string): Promise<Buffer> {
  const MathJax = getMathJax();
  await ensureMathJax();
  const serialized = MathJax.startup.adaptor.serializeXML(
    MathJax.tex2svg(trimmed, { display: true }),
  );
  const innerSvg = extractInnerSvg(serialized);
  const svg = prepareEquationSvgForRaster(innerSvg);
  return sharp(Buffer.from(svg), { density: 144 })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
}

function extractInnerSvg(serialized: string): string {
  const inner = serialized.match(/<svg[\s\S]*?<\/svg>/)?.[0];
  if (!inner) {
    throw new Error('MathJax did not produce SVG output');
  }
  return inner;
}

function prepareEquationSvgForRaster(innerSvg: string): string {
  const viewBox = innerSvg.match(/viewBox="([^"]+)"/)?.[1]?.split(/\s+/).map(Number);
  if (viewBox?.length !== 4) {
    return innerSvg.replace(
      'stroke="currentColor" fill="currentColor"',
      'stroke="#000000" fill="#000000"',
    );
  }

  const [minX, minY, vbW, vbH] = viewBox;
  const scale = MAX_EQUATION_WIDTH_PX / vbW;
  const pxW = Math.max(1, Math.round(vbW * scale));
  const pxH = Math.max(1, Math.round(vbH * scale));

  const openTagEnd = innerSvg.indexOf('>');
  if (openTagEnd < 0) {
    throw new Error('Invalid equation SVG');
  }
  const openTag = innerSvg.slice(0, openTagEnd + 1);
  const body = innerSvg.slice(openTagEnd + 1, innerSvg.lastIndexOf('</svg>'));

  const openSansEx = openTag
    .replace(/\s+width="[^"]*"/, '')
    .replace(/\s+height="[^"]*"/, '')
    .replace(/\s+style="[^"]*"/, '')
    .replace(/viewBox="[^"]*"/, `viewBox="0 0 ${vbW} ${vbH}"`)
    .replace(/<svg/, `<svg width="${pxW}" height="${pxH}"`);

  return `${openSansEx}<rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#ffffff"/><g transform="translate(${-minX}, ${-minY})">${body}</g></svg>`
    .replace(
      'stroke="currentColor" fill="currentColor"',
      'stroke="#000000" fill="#000000"',
    );
}
