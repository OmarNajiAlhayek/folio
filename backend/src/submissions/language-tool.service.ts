import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GrammarNote = {
  excerpt: string;
  suggestion: string;
  rule: string;
  offset: number;
  length: number;
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
   * Returns an empty array when LanguageTool is disabled or unavailable.
   * Language is auto-detected (`language=auto`).
   */
  async check(text: string): Promise<GrammarNote[]> {
    if (!this.isEnabled()) return [];
    const trimmed = text.trim();
    if (!trimmed) return [];

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
        return [];
      }

      const data = (await res.json()) as LtResponse;
      return (data.matches ?? [])
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
    } catch (err) {
      this.logger.warn(
        'LanguageTool unavailable: %s',
        err instanceof Error ? err.message : String(err),
      );
      return [];
    }
  }
}
