import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GrammarNote = {
  excerpt: string;
  suggestion: string;
  rule: string;
  offset: number;
  length: number;
};

export type GrammarCheckResult = {
  notes: GrammarNote[];
  /** True when the checker is off or the LanguageTool process cannot be reached. */
  unavailable: boolean;
};

type LtMatch = {
  message: string;
  shortMessage?: string;
  replacements: Array<{ value: string }>;
  offset: number;
  length: number;
  context: { text: string; offset: number; length: number };
  rule: { id: string; description: string };
};

type LtResponse = {
  matches: LtMatch[];
};

@Injectable()
export class LanguageToolService {
  private readonly logger = new Logger(LanguageToolService.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return (
      this.config.get<string>('LANGUAGE_TOOL_URL', 'http://localhost:8010') +
      '/v2'
    );
  }

  isEnabled(): boolean {
    return (
      this.config
        .get<string>('LANGUAGE_TOOL_ENABLED', 'false')
        .toLowerCase() === 'true'
    );
  }

  /**
   * Checks the provided text for grammar/spelling issues.
   * Notes are empty when LanguageTool is disabled, the text is empty, or the
   * server cannot be reached. `unavailable` distinguishes a real pass from a
   * checker that did not run.
   * Language is auto-detected (`language=auto`).
   */
  async inspect(text: string): Promise<GrammarCheckResult> {
    if (!this.isEnabled()) return { notes: [], unavailable: true };
    const trimmed = text.trim();
    if (!trimmed) return { notes: [], unavailable: false };

    const url = `${this.baseUrl()}/check`;
    const body = new URLSearchParams({
      text: trimmed,
      language: 'auto',
      enabledOnly: 'false',
    });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        this.logger.warn(
          'LanguageTool returned HTTP %d for grammar check',
          res.status,
        );
        return { notes: [], unavailable: true };
      }

      const data = (await res.json()) as LtResponse;
      const notes = (data.matches ?? [])
        .filter((m) => m.replacements.length > 0 || m.shortMessage)
        .slice(0, 50)
        .map((m) => ({
          excerpt: m.context.text.slice(
            m.context.offset,
            m.context.offset + m.context.length,
          ),
          suggestion:
            m.replacements
              .slice(0, 3)
              .map((r) => r.value)
              .join(' / ') || m.message,
          rule: m.rule.description || m.rule.id,
          offset: m.offset,
          length: m.length,
        }));
      return { notes, unavailable: false };
    } catch (err) {
      this.logger.warn(
        'LanguageTool unavailable: %s',
        err instanceof Error ? err.message : String(err),
      );
      return { notes: [], unavailable: true };
    }
  }

  async check(text: string): Promise<GrammarNote[]> {
    const result = await this.inspect(text);
    return result.notes;
  }
}
