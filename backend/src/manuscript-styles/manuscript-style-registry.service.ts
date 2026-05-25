import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConstructorContent } from '../submissions/constructor-content.types';
import type {
  ManuscriptStyleCatalogResponseDto,
  ManuscriptStyleProfile,
} from './manuscript-style.types';
import { manuscriptProfilesMap } from './manuscript-profiles-map';
import {
  DEFAULT_FALLBACK_MANUSCRIPT_STYLE_ID,
  damascusUniversityJournalV1,
} from './profiles/damascus-university-journal-v1.profile';

const UNKNOWN_STYLE_MESSAGE =
  'Manuscript style is no longer available; choose a supported style from the list.';

@Injectable()
export class ManuscriptStyleRegistryService {
  private readonly profiles: Map<string, ManuscriptStyleProfile>;

  constructor(private readonly config: ConfigService) {
    this.profiles = manuscriptProfilesMap(damascusUniversityJournalV1);
  }

  has(id: string): boolean {
    return this.profiles.has(id);
  }

  /**
   * Returns the profile for `id`. Unknown ids → 400 `MANUSCRIPT_STYLE_UNKNOWN`
   * (same as PATCH/generate), not 500 — callers must pass vetted ids from
   * {@link resolveEffectiveStyleId} when resolving from user content.
   */
  getProfile(id: string): ManuscriptStyleProfile {
    this.throwIfUnknownStyleId(id);
    return this.profiles.get(id)!;
  }

  /** Phase 1: env → compile-time fallback. Phase 2 inserts journal default before env. */
  resolveDefaultStyleId(): string {
    const envId = this.config
      .get<string>('DEFAULT_MANUSCRIPT_STYLE_ID')
      ?.trim();
    if (envId && this.profiles.has(envId)) {
      return envId;
    }
    return DEFAULT_FALLBACK_MANUSCRIPT_STYLE_ID;
  }

  /**
   * Content field wins when present and known; otherwise default chain.
   * Unknown non-empty `manuscriptStyleId` → fail loud (do not fall back).
   */
  resolveEffectiveStyleId(content: ConstructorContent | null | undefined): string {
    const trimmed = content?.manuscriptStyleId?.trim();
    if (trimmed) {
      this.throwIfUnknownStyleId(trimmed);
      return trimmed;
    }
    return this.resolveDefaultStyleId();
  }

  /**
   * PATCH / submit: reject stored unknown ids without resolving to default.
   */
  assertConstructorContentStyleKnown(
    content: ConstructorContent | null | undefined,
  ): void {
    if (!content) return;
    const trimmed = content.manuscriptStyleId?.trim();
    if (!trimmed) return;
    this.throwIfUnknownStyleId(trimmed);
  }

  getCatalog(): ManuscriptStyleCatalogResponseDto {
    const defaultStyleId = this.resolveDefaultStyleId();
    const styles = [...this.profiles.values()].map((p) => {
      const entry: ManuscriptStyleCatalogResponseDto['styles'][number] = {
        id: p.id,
        version: p.version,
        displayNameKey: p.displayNameKey,
        descriptionKey: p.descriptionKey,
        previewTheme: p.previewTheme,
      };
      if (p.constructor) {
        entry.constructorGuidance = {
          extraMandatorySlots: p.constructor.extraMandatorySlots,
          recommendedPresets: p.constructor.recommendedPresets,
          requiredRichTextKinds: p.constructor.requiredRichTextKinds,
        };
      }
      return entry;
    });
    return { defaultStyleId, styles };
  }

  private throwIfUnknownStyleId(id: string): void {
    if (!this.profiles.has(id)) {
      throw new BadRequestException({
        message: UNKNOWN_STYLE_MESSAGE,
        code: 'MANUSCRIPT_STYLE_UNKNOWN',
      });
    }
  }
}
