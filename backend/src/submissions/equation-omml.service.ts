import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  convertLatex2Math,
  mathJaxReady,
} from '@micromatrix.org/docx-math-converter';
import type { ParagraphChild } from 'docx';
import { EquationRenderService } from './equation-render.service';

export type EquationRenderResult =
  | { kind: 'omml'; children: ParagraphChild[] }
  | {
      kind: 'png';
      png: Buffer;
      widthPx: number;
      heightPx: number;
    };

@Injectable()
export class EquationOmmlService implements OnModuleInit {
  private readonly logger = new Logger(EquationOmmlService.name);
  private mathReady = false;

  constructor(private readonly equationRender: EquationRenderService) {}

  async onModuleInit(): Promise<void> {
    try {
      await mathJaxReady();
      this.mathReady = true;
    } catch (err) {
      this.logger.warn(
        `OMML math init failed — equations will fall back to PNG: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Prefer native Word OMML; fall back to PNG raster on failure. */
  async renderEquation(latex: string): Promise<EquationRenderResult> {
    const trimmed = latex.trim();
    if (!this.mathReady) {
      try {
        await mathJaxReady();
        this.mathReady = true;
      } catch {
        this.mathReady = false;
      }
    }
    if (this.mathReady) {
      try {
        const mathObj = convertLatex2Math(trimmed);
        return {
          kind: 'omml',
          children: [mathObj as ParagraphChild],
        };
      } catch {
        // fall through
      }
    }
    const { png, widthPx, heightPx } =
      await this.equationRender.renderLatexToPngWithSize(trimmed);
    return { kind: 'png', png, widthPx, heightPx };
  }
}
