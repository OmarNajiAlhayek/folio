import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ManuscriptStyleRegistryService } from '../manuscript-styles/manuscript-style-registry.service';
import type { ConstructorContent } from '../submissions/constructor-content.types';

describe('ManuscriptStyleRegistryService', () => {
  async function setup(env: Record<string, string | undefined> = {}) {
    const mod = await Test.createTestingModule({
      providers: [
        ManuscriptStyleRegistryService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => env[key],
          },
        },
      ],
    }).compile();
    return mod.get(ManuscriptStyleRegistryService);
  }

  it('resolveDefaultStyleId uses env when valid', async () => {
    const r = await setup({
      DEFAULT_MANUSCRIPT_STYLE_ID: 'damascus-university-journal-v1',
    });
    expect(r.resolveDefaultStyleId()).toBe('damascus-university-journal-v1');
  });

  it('resolveDefaultStyleId falls back when env invalid', async () => {
    const r = await setup({ DEFAULT_MANUSCRIPT_STYLE_ID: 'unknown-style' });
    expect(r.resolveDefaultStyleId()).toBe('damascus-university-journal-v1');
  });

  it('resolveEffectiveStyleId rejects unknown stored id', async () => {
    const r = await setup({});
    const content: ConstructorContent = {
      defaultDir: 'ltr',
      manuscriptStyleId: 'not-a-real-profile',
      sections: [],
    };
    expect(() => r.resolveEffectiveStyleId(content)).toThrow(BadRequestException);
  });

  it('resolveEffectiveStyleId treats whitespace-only manuscriptStyleId as absent', async () => {
    const r = await setup({});
    const content: ConstructorContent = {
      defaultDir: 'ltr',
      manuscriptStyleId: '   \t  ',
      sections: [],
    };
    expect(r.resolveEffectiveStyleId(content)).toBe('damascus-university-journal-v1');
  });

  it('assertConstructorContentStyleKnown allows whitespace-only id', async () => {
    const r = await setup({});
    const content: ConstructorContent = {
      defaultDir: 'ltr',
      manuscriptStyleId: '   ',
      sections: [],
    };
    expect(() => r.assertConstructorContentStyleKnown(content)).not.toThrow();
  });

  it('getProfile throws BadRequestException for unknown id', async () => {
    const r = await setup({});
    expect(() => r.getProfile('no-such-style')).toThrow(BadRequestException);
  });

  it('getCatalog includes defaultStyleId', async () => {
    const r = await setup({});
    const cat = r.getCatalog();
    expect(cat.defaultStyleId).toBe('damascus-university-journal-v1');
    expect(cat.styles.some((s) => s.id === 'damascus-university-journal-v1')).toBe(
      true,
    );
  });
});
