import {
  buildBodyPlainText,
  checkDamascusStructure,
  damascusCitationStyleIssues,
  damascusDisciplineIssues,
  damascusFormatIssues,
  extractInlineCitations,
  extractReferenceList,
} from './submission-copyedit-text.util';
import type { ConstructorContent } from './constructor-content.types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Replace one section in compliantContent with a mutated copy. */
function withSection(
  base: ConstructorContent,
  id: string,
  patch: object,
): ConstructorContent {
  return {
    ...base,
    sections: base.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

/** Remove section(s) matching a predicate. */
function withoutSection(
  base: ConstructorContent,
  pred: (s: (typeof base.sections)[number]) => boolean,
): ConstructorContent {
  return { ...base, sections: base.sections.filter((s) => !pred(s)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Golden fixture — produces ZERO format issues
// ─────────────────────────────────────────────────────────────────────────────

/** A fully-compliant sample that must produce zero format issues. */
const compliantContent: ConstructorContent = {
  defaultDir: 'rtl',
  sections: [
    // Bilingual titles
    {
      id: 'title-en',
      kind: 'title',
      lang: 'en',
      text: 'An English Title for This Study',
    },
    { id: 'title-ar', kind: 'title', lang: 'ar', text: 'عنوان عربي للدراسة' },

    // Authors — one corresponding, all fields populated
    {
      id: 'authors',
      kind: 'authors',
      authors: [
        {
          fullName: 'John Smith',
          title: 'Dr.',
          email: 'john@damascus.edu.sy',
          affiliation: 'Damascus University',
          isCorresponding: true,
        },
        {
          fullName: 'Jane Doe',
          title: 'Prof.',
          email: 'jane@damascus.edu.sy',
          affiliation: 'Damascus University',
          isCorresponding: false,
        },
      ],
    },

    // English abstract — ≤300 words, exactly 5 keywords, all present in text
    {
      id: 'abs-en',
      kind: 'abstract',
      lang: 'en',
      text: 'This study examines Neural Network Deep Learning Algorithm performance optimization in classification tasks.',
      keywords: 'Neural, Network, Deep, Learning, Algorithm',
    },

    // Arabic abstract — ≤300 words, exactly 5 keywords, all present in text
    {
      id: 'abs-ar',
      kind: 'abstract',
      lang: 'ar',
      text: 'تبحث هذه الدراسة في الشبكة العصبية والتعلم العميق والخوارزمية والأداء والتصنيف.',
      keywords: 'الشبكة, العصبية, التعلم, الخوارزمية, الأداء',
    },

    // IMRaD sections (via presetSourceId for reliable detection)
    {
      id: 'h-intro',
      kind: 'heading1',
      text: 'Introduction',
      presetSourceId: 'introduction',
    },
    {
      id: 'h-lit',
      kind: 'heading1',
      text: 'Literature Review',
      presetSourceId: 'literatureReview',
    },
    {
      id: 'h-methods',
      kind: 'heading1',
      text: 'Materials and Methods',
      presetSourceId: 'materialsAndMethods',
    },
    {
      id: 'h-results',
      kind: 'heading1',
      text: 'Results and Discussion',
      presetSourceId: 'resultsAndDiscussion',
    },
    {
      id: 'h-concl',
      kind: 'heading1',
      text: 'Conclusions',
      presetSourceId: 'conclusions',
    },

    // Conclusions — numbered list per §4
    {
      id: 'p-concl',
      kind: 'paragraph',
      html: '<ol><li>First conclusion.</li><li>Second conclusion.</li></ol>',
    },

    // Body paragraph with inline citations (author-year style)
    {
      id: 'p1',
      kind: 'paragraph',
      html: '<p>Prior work (Smith, 2020) is cited here.</p>',
    },

    // References — Arabic first, then English
    {
      id: 'refs',
      kind: 'references',
      items: [
        { lang: 'ar', html: '<p>الباحث ع. دراسة في الموضوع. 2021.</p>' },
        { lang: 'en', html: '<p>Smith J. Example Study. 2020.</p>' },
        { lang: 'en', html: '<p>Jones A. Other Work. 2019.</p>' },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Extractors
// ─────────────────────────────────────────────────────────────────────────────

describe('extractInlineCitations', () => {
  it('extracts author-year citation', () => {
    const cites = extractInlineCitations(compliantContent);
    expect(cites).toContain('(Smith, 2020)');
  });

  it('extracts numbered citation from paragraph', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: [
        ...compliantContent.sections,
        {
          id: 'p-num',
          kind: 'paragraph',
          html: '<p>See also [2] and [3].</p>',
        },
      ],
    };
    const cites = extractInlineCitations(content);
    expect(cites).toContain('[2]');
  });

  it('extracts Arabic author-year citation', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: [
        ...compliantContent.sections,
        { id: 'p-ar', kind: 'paragraph', html: '<p>(المقدسي، 2020، 118)</p>' },
      ],
    };
    const cites = extractInlineCitations(content);
    expect(cites.some((c) => c.includes('المقدسي'))).toBe(true);
  });

  it('returns empty array for null content', () => {
    expect(extractInlineCitations(null)).toEqual([]);
  });
});

describe('extractReferenceList', () => {
  it('returns all reference entries stripped of HTML', () => {
    const refs = extractReferenceList(compliantContent);
    expect(refs).toHaveLength(3);
    expect(refs.some((r) => r.includes('Smith'))).toBe(true);
    expect(refs.some((r) => r.includes('الباحث'))).toBe(true);
  });

  it('returns empty array when no references section', () => {
    const content = withoutSection(
      compliantContent,
      (s) => s.kind === 'references',
    );
    expect(extractReferenceList(content)).toEqual([]);
  });
});

describe('buildBodyPlainText', () => {
  it('includes headings and paragraph text', () => {
    const body = buildBodyPlainText(compliantContent);
    expect(body).toMatch(/Introduction/);
    expect(body).toMatch(/Smith, 2020/);
  });

  it('excludes references section entries', () => {
    const body = buildBodyPlainText(compliantContent);
    expect(body).not.toMatch(/Smith J\. Example Study/);
  });

  it('excludes authors section', () => {
    const body = buildBodyPlainText(compliantContent);
    expect(body).not.toMatch(/john@damascus/);
  });

  it('returns empty string for null content', () => {
    expect(buildBodyPlainText(null)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full compliance — zero issues
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — full compliance', () => {
  it('produces zero issues for a fully compliant manuscript', () => {
    const check = checkDamascusStructure(compliantContent);
    const issues = damascusFormatIssues(check);
    expect(issues).toEqual([]);
  });

  it('sets all IMRaD booleans true', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.hasIntroduction).toBe(true);
    expect(check.hasLiteratureReview).toBe(true);
    expect(check.hasMaterialsAndMethods).toBe(true);
    expect(check.hasResultsAndDiscussion).toBe(true);
    expect(check.hasConclusions).toBe(true);
    expect(check.hasReferences).toBe(true);
  });

  it('detects bilingual titles', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.hasTitleEn).toBe(true);
    expect(check.hasTitleAr).toBe(true);
  });

  it('detects authors, corresponding author, and no missing fields', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.hasAuthors).toBe(true);
    expect(check.hasCorrespondingAuthor).toBe(true);
    expect(check.authorsWithoutEmail).toHaveLength(0);
    expect(check.authorsWithoutAffiliation).toHaveLength(0);
    expect(check.authorsWithoutTitle).toHaveLength(0);
  });

  it('counts keywords correctly', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.hasKeywordsEn).toBe(true);
    expect(check.hasKeywordsAr).toBe(true);
    expect(check.keywordsEnCount).toBe(5);
    expect(check.keywordsArCount).toBe(5);
    expect(check.keywordsEnPresentInAbstract).toBe(true);
    expect(check.keywordsArPresentInAbstract).toBe(true);
  });

  it('detects Arabic-first reference compliance', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.referencesArabicFirstCompliant).toBe(true);
  });

  it('detects numbered conclusions items', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.conclusionsHasNumberedItems).toBe(true);
  });

  it('has no punctuation or citation page prefix violations', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.punctuationSpacingViolations).toBe(0);
    expect(check.citationPagePrefixViolations).toBe(0);
  });

  it('has correct English capitalisation', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.englishTitleCapitalisationOk).toBe(true);
    expect(check.englishKeywordsCapitalisationOk).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Titles (§4)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — titles', () => {
  it('flags missing English title', () => {
    const content = withoutSection(
      compliantContent,
      (s) => s.kind === 'title' && s.lang === 'en',
    );
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('English title'))).toBe(true);
  });

  it('flags missing Arabic title', () => {
    const content = withoutSection(
      compliantContent,
      (s) => s.kind === 'title' && s.lang === 'ar',
    );
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('Arabic title'))).toBe(true);
  });

  it('flags English title not in Title Case — §3', () => {
    const content = withSection(compliantContent, 'title-en', {
      text: 'an english title without capitals',
    });
    const check = checkDamascusStructure(content);
    expect(check.englishTitleCapitalisationOk).toBe(false);
    const issues = damascusFormatIssues(check);
    expect(issues.some((i) => i.includes('Title Case'))).toBe(true);
  });

  it('does not flag correct Title Case with common articles lowercase', () => {
    const content = withSection(compliantContent, 'title-en', {
      text: 'A Study of the Effects in Neural Networks',
    });
    const check = checkDamascusStructure(content);
    expect(check.englishTitleCapitalisationOk).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Authors (§4)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — authors', () => {
  it('flags no authors listed', () => {
    const content = withoutSection(
      compliantContent,
      (s) => s.kind === 'authors',
    );
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('No authors listed'))).toBe(true);
  });

  it('flags missing corresponding author', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'authors'
          ? {
              ...s,
              authors: s.authors.map((a) => ({ ...a, isCorresponding: false })),
            }
          : s,
      ),
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('corresponding author'))).toBe(true);
  });

  it('flags author missing email', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'authors'
          ? {
              ...s,
              authors: [{ ...s.authors[0], email: '' }, ...s.authors.slice(1)],
            }
          : s,
      ),
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('no email address'))).toBe(true);
    expect(issues.some((i) => i.includes('John Smith'))).toBe(true);
  });

  it('flags author missing affiliation', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'authors'
          ? {
              ...s,
              authors: [
                { ...s.authors[0], affiliation: '' },
                ...s.authors.slice(1),
              ],
            }
          : s,
      ),
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('institution/affiliation'))).toBe(
      true,
    );
    expect(issues.some((i) => i.includes('John Smith'))).toBe(true);
  });

  it('flags author missing academic title (صفة)', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'authors'
          ? {
              ...s,
              authors: [{ ...s.authors[0], title: '' }, ...s.authors.slice(1)],
            }
          : s,
      ),
    };
    const check = checkDamascusStructure(content);
    expect(check.authorsWithoutTitle).toContain('John Smith');
    const issues = damascusFormatIssues(check);
    expect(issues.some((i) => i.includes('academic title/rank'))).toBe(true);
    expect(issues.some((i) => i.includes('John Smith'))).toBe(true);
  });

  it('names each author separately for multiple missing fields', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'authors'
          ? {
              ...s,
              authors: [
                { ...s.authors[0], email: '' },
                { ...s.authors[1], affiliation: '' },
              ],
            }
          : s,
      ),
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(
      issues.some((i) => i.includes('John Smith') && i.includes('email')),
    ).toBe(true);
    expect(
      issues.some((i) => i.includes('Jane Doe') && i.includes('affiliation')),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Abstracts & word count (§3)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — abstracts', () => {
  it('flags missing English abstract', () => {
    const content = withoutSection(
      compliantContent,
      (s) => s.kind === 'abstract' && s.lang === 'en',
    );
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('Missing English abstract'))).toBe(
      true,
    );
  });

  it('flags missing Arabic abstract', () => {
    const content = withoutSection(
      compliantContent,
      (s) => s.kind === 'abstract' && s.lang === 'ar',
    );
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('Missing Arabic abstract'))).toBe(
      true,
    );
  });

  it('flags English abstract over 300 words — §3', () => {
    const longAbstract = Array.from({ length: 310 }, (_, i) => `word${i}`).join(
      ' ',
    );
    const content = withSection(compliantContent, 'abs-en', {
      text: longAbstract,
    });
    const check = checkDamascusStructure(content);
    expect(check.abstractEnWordCount).toBeGreaterThan(300);
    const issues = damascusFormatIssues(check);
    expect(
      issues.some((i) => i.includes('English abstract exceeds 300 words')),
    ).toBe(true);
  });

  it('flags Arabic abstract over 300 words — §3', () => {
    const longAbstract = Array.from({ length: 305 }, (_, i) => `كلمة${i}`).join(
      ' ',
    );
    const content = withSection(compliantContent, 'abs-ar', {
      text: longAbstract,
    });
    const check = checkDamascusStructure(content);
    expect(check.abstractArWordCount).toBeGreaterThan(300);
    const issues = damascusFormatIssues(check);
    expect(
      issues.some((i) => i.includes('Arabic abstract exceeds 300 words')),
    ).toBe(true);
  });

  it('does not flag abstracts at exactly 300 words', () => {
    const exactAbstract = Array.from(
      { length: 300 },
      (_, i) => `word${i}`,
    ).join(' ');
    const content = withSection(compliantContent, 'abs-en', {
      text: exactAbstract,
      keywords: 'word0, word1, word2, word3, word4',
    });
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('exceeds 300 words'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Keywords (§3)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — keywords', () => {
  it('flags missing English keywords', () => {
    const content = withSection(compliantContent, 'abs-en', { keywords: '' });
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(
      issues.some((i) => i.includes('Missing keywords for the English')),
    ).toBe(true);
  });

  it('flags missing Arabic keywords', () => {
    const content = withSection(compliantContent, 'abs-ar', { keywords: '' });
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(
      issues.some((i) => i.includes('Missing keywords for the Arabic')),
    ).toBe(true);
  });

  it('flags English keyword count != 5 (too few)', () => {
    const content = withSection(compliantContent, 'abs-en', {
      keywords: 'Neural, Network, Deep',
    });
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(
      issues.some((i) => i.includes('3 keyword(s)') && i.includes('exactly 5')),
    ).toBe(true);
  });

  it('flags English keyword count != 5 (too many)', () => {
    const content = withSection(compliantContent, 'abs-en', {
      text: 'Alpha Beta Gamma Delta Epsilon Zeta in this study.',
      keywords: 'Alpha, Beta, Gamma, Delta, Epsilon, Zeta',
    });
    const check = checkDamascusStructure(content);
    expect(check.keywordsEnCount).toBe(6);
    const issues = damascusFormatIssues(check);
    expect(issues.some((i) => i.includes('6 keyword(s)'))).toBe(true);
  });

  it('flags Arabic keyword count != 5', () => {
    const content = withSection(compliantContent, 'abs-ar', {
      text: 'تبحث هذه الدراسة في الشبكة والتعلم والخوارزمية.',
      keywords: 'الشبكة, التعلم, الخوارزمية',
    });
    const check = checkDamascusStructure(content);
    expect(check.keywordsArCount).toBe(3);
    const issues = damascusFormatIssues(check);
    expect(issues.some((i) => i.includes('3 keyword(s)'))).toBe(true);
  });

  it('flags English keyword not present in abstract text', () => {
    const content = withSection(compliantContent, 'abs-en', {
      text: 'Short abstract without any of the required terms.',
      keywords: 'alpha, beta, gamma, delta, epsilon',
    });
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(
      issues.some((i) => i.includes('do not appear in the English abstract')),
    ).toBe(true);
  });

  it('flags Arabic keyword not present in Arabic abstract text', () => {
    const content = withSection(compliantContent, 'abs-ar', {
      text: 'ملخص قصير لا يحتوي على الكلمات المفتاحية.',
      keywords: 'كلمة, مفقودة, غير, موجودة, هنا',
    });
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(
      issues.some((i) => i.includes('do not appear in the Arabic abstract')),
    ).toBe(true);
  });

  it('flags English keywords not in Title Case — §3', () => {
    const content = withSection(compliantContent, 'abs-en', {
      keywords: 'neural, network, deep, learning, algorithm',
    });
    const check = checkDamascusStructure(content);
    expect(check.englishKeywordsCapitalisationOk).toBe(false);
    const issues = damascusFormatIssues(check);
    expect(
      issues.some(
        (i) => i.includes('capital letter') && i.includes('keywords'),
      ),
    ).toBe(true);
  });

  it('does not flag Arabic keywords for capitalisation', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(compliantContent),
    );
    expect(
      issues.some((i) => i.includes('الشبكة') && i.includes('capital')),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IMRaD structure (§4) — each section missing independently
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — missing IMRaD sections', () => {
  const removePreset = (id: string) =>
    withoutSection(
      compliantContent,
      (s) => 'presetSourceId' in s && s.presetSourceId === id,
    );

  it('flags missing Introduction', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(removePreset('introduction')),
    );
    expect(issues.some((i) => i.includes("'Introduction'"))).toBe(true);
  });

  it('flags missing Literature Review', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(removePreset('literatureReview')),
    );
    expect(issues.some((i) => i.includes("'Literature Review'"))).toBe(true);
  });

  it('flags missing Materials and Methods', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(removePreset('materialsAndMethods')),
    );
    expect(issues.some((i) => i.includes("'Materials and Methods'"))).toBe(
      true,
    );
  });

  it('flags missing Results and Discussion', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(removePreset('resultsAndDiscussion')),
    );
    expect(issues.some((i) => i.includes("'Results and Discussion'"))).toBe(
      true,
    );
  });

  it('flags missing Conclusions', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(removePreset('conclusions')),
    );
    expect(issues.some((i) => i.includes("'Conclusions'"))).toBe(true);
  });

  it('detects IMRaD sections by heading text when presetSourceId absent', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'heading1' && 'presetSourceId' in s
          ? { id: s.id, kind: s.kind, text: s.text }
          : s,
      ),
    };
    const check = checkDamascusStructure(content);
    expect(check.hasIntroduction).toBe(true);
    expect(check.hasLiteratureReview).toBe(true);
    expect(check.hasMaterialsAndMethods).toBe(true);
    expect(check.hasResultsAndDiscussion).toBe(true);
    expect(check.hasConclusions).toBe(true);
  });

  it('detects Arabic IMRaD headings by text', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) => {
        if (s.kind !== 'heading1') return s;
        const textMap: Record<string, string> = {
          'h-intro': 'المقدمة',
          'h-lit': 'الدراسات السابقة',
          'h-methods': 'مواد البحث ومنهجه',
          'h-results': 'النتائج والمناقشة',
          'h-concl': 'الاستنتاجات',
        };
        return { id: s.id, kind: s.kind, text: textMap[s.id] ?? s.text };
      }),
    };
    const check = checkDamascusStructure(content);
    expect(check.hasIntroduction).toBe(true);
    expect(check.hasLiteratureReview).toBe(true);
    expect(check.hasMaterialsAndMethods).toBe(true);
    expect(check.hasResultsAndDiscussion).toBe(true);
    expect(check.hasConclusions).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Conclusions structure (§4)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — conclusions structure', () => {
  it('flags conclusions without numbered paragraphs', () => {
    const content = withSection(compliantContent, 'p-concl', {
      html: '<p>Plain prose conclusions without an ordered list.</p>',
    });
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('numbered paragraphs'))).toBe(true);
  });

  it('accepts <ol> numbered conclusions', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(compliantContent),
    );
    expect(issues.some((i) => i.includes('numbered paragraphs'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// References (§4, §7)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — references', () => {
  it('flags empty references section', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'references' ? { ...s, items: [] } : s,
      ),
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('references list is empty'))).toBe(
      true,
    );
  });

  it('flags missing references section entirely', () => {
    const content = withoutSection(
      compliantContent,
      (s) => s.kind === 'references',
    );
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('No references section'))).toBe(true);
  });

  it('flags Arabic reference appearing after English — §7', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'references'
          ? {
              ...s,
              items: [
                { lang: 'en', html: '<p>Smith J. 2020.</p>' },
                { lang: 'ar', html: '<p>باحث عربي. 2021.</p>' },
              ],
            }
          : s,
      ),
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('Arabic-first'))).toBe(true);
  });

  it('allows all-English or all-Arabic reference lists without ordering flag', () => {
    const allEnglish: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) =>
        s.kind === 'references'
          ? { ...s, items: [{ lang: 'en', html: '<p>Smith J. 2020.</p>' }] }
          : s,
      ),
    };
    const check = checkDamascusStructure(allEnglish);
    expect(check.referencesArabicFirstCompliant).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Word count (§3: max ~25 pages / soft ~7500 body words)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — body word count', () => {
  it('flags manuscript body exceeding 7500 words', () => {
    const bigParagraph = Array.from(
      { length: 7600 },
      (_, i) => `word${i}`,
    ).join(' ');
    const content: ConstructorContent = {
      ...compliantContent,
      sections: [
        ...compliantContent.sections,
        { id: 'p-big', kind: 'paragraph', html: `<p>${bigParagraph}</p>` },
      ],
    };
    const check = checkDamascusStructure(content);
    expect(check.totalBodyWordCount).toBeGreaterThan(7500);
    const issues = damascusFormatIssues(check);
    expect(issues.some((i) => i.includes('7,500-word soft limit'))).toBe(true);
  });

  it('does not flag manuscripts under 7500 words', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(compliantContent),
    );
    expect(issues.some((i) => i.includes('7,500-word'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Table notes (§5)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — table notes', () => {
  it('flags table notes not starting with "حيث إن:"', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: [
        ...compliantContent.sections,
        {
          id: 'tbl1',
          kind: 'table',
          caption: 'Table 1',
          hasHeaderRow: true,
          notes: 'Note without the required Arabic prefix.',
          rows: [],
        },
      ],
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('حيث إن'))).toBe(true);
  });

  it('does not flag table notes starting with "حيث إن:"', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: [
        ...compliantContent.sections,
        {
          id: 'tbl2',
          kind: 'table',
          caption: 'Table 2',
          hasHeaderRow: true,
          notes: 'حيث إن: هذه ملاحظة توضيحية للجدول.',
          rows: [],
        },
      ],
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('حيث إن'))).toBe(false);
  });

  it('does not flag table without notes', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: [
        ...compliantContent.sections,
        {
          id: 'tbl3',
          kind: 'table',
          caption: 'Table 3',
          hasHeaderRow: false,
          rows: [],
        },
      ],
    };
    const issues = damascusFormatIssues(checkDamascusStructure(content));
    expect(issues.some((i) => i.includes('table note'))).toBe(false);
  });

  it('counts multiple non-compliant table notes', () => {
    const content: ConstructorContent = {
      ...compliantContent,
      sections: [
        ...compliantContent.sections,
        {
          id: 'tbl4',
          kind: 'table',
          caption: 'T4',
          hasHeaderRow: false,
          notes: 'Bad note one.',
          rows: [],
        },
        {
          id: 'tbl5',
          kind: 'table',
          caption: 'T5',
          hasHeaderRow: false,
          notes: 'Bad note two.',
          rows: [],
        },
      ],
    };
    const check = checkDamascusStructure(content);
    expect(check.tableNotesWithoutPrefix).toBe(2);
    const issues = damascusFormatIssues(check);
    expect(issues.some((i) => i.includes('2 table note(s)'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Punctuation spacing (§3)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — punctuation spacing', () => {
  it('flags space before comma', () => {
    const content = withSection(compliantContent, 'p1', {
      html: '<p>This is wrong , and also wrong ; here.</p>',
    });
    const check = checkDamascusStructure(content);
    expect(check.punctuationSpacingViolations).toBeGreaterThan(0);
    const issues = damascusFormatIssues(check);
    expect(issues.some((i) => i.includes('punctuation-spacing'))).toBe(true);
  });

  it('flags space before Arabic comma (،)', () => {
    const content = withSection(compliantContent, 'p1', {
      html: '<p>هذا خطأ ، لا يجوز.</p>',
    });
    const check = checkDamascusStructure(content);
    expect(check.punctuationSpacingViolations).toBeGreaterThan(0);
  });

  it('flags space inside parentheses', () => {
    const content = withSection(compliantContent, 'p1', {
      html: '<p>See ( Smith, 2020 ) for details.</p>',
    });
    const check = checkDamascusStructure(content);
    expect(check.punctuationSpacingViolations).toBeGreaterThan(0);
  });

  it('does not flag compliant punctuation', () => {
    const issues = damascusFormatIssues(
      checkDamascusStructure(compliantContent),
    );
    expect(issues.some((i) => i.includes('punctuation-spacing'))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Citation page prefix (§6)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — citation page prefix', () => {
  it('flags "ص" before page number in citation — §6', () => {
    const content = withSection(compliantContent, 'p1', {
      html: '<p>(المقدسي، 2020، ص 118)</p>',
    });
    const check = checkDamascusStructure(content);
    expect(check.citationPagePrefixViolations).toBeGreaterThan(0);
    const issues = damascusFormatIssues(check);
    expect(
      issues.some(
        (i) =>
          i.includes('"ص"') || i.includes('"p"') || i.includes('page number'),
      ),
    ).toBe(true);
  });

  it('flags "p" before page number in English citation — §6', () => {
    const content = withSection(compliantContent, 'p1', {
      html: '<p>(Smith, 2020, p 45)</p>',
    });
    const check = checkDamascusStructure(content);
    expect(check.citationPagePrefixViolations).toBeGreaterThan(0);
  });

  it('does not flag citations without page prefix', () => {
    const check = checkDamascusStructure(compliantContent);
    expect(check.citationPagePrefixViolations).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discipline-aware checks (§3)
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusDisciplineIssues', () => {
  const withAuthorYearCitations: ConstructorContent = {
    defaultDir: 'ltr',
    sections: [
      {
        id: 'p1',
        kind: 'paragraph',
        html: '<p>(Smith, 2020) and (Jones, 2019) and (Brown, 2018) are cited.</p>',
      },
      { id: 'refs', kind: 'references', items: [] },
    ],
  };

  it('does not report citation style — the journal decides that', () => {
    const issues = damascusDisciplineIssues(
      ['العلوم الطبية'],
      withAuthorYearCitations,
    );
    expect(issues).toEqual([]);
  });

  it('warns Engineering discipline about two-column layout — §3', () => {
    const issues = damascusDisciplineIssues(
      ['العلوم الهندسية'],
      compliantContent,
    );
    expect(issues.some((i) => i.includes('two-column'))).toBe(true);
  });

  it('returns no issues for empty disciplines list', () => {
    expect(damascusDisciplineIssues([], compliantContent)).toHaveLength(0);
  });

  it('returns no issues for null content', () => {
    expect(damascusDisciplineIssues(['العلوم الطبية'], null)).toHaveLength(0);
  });
});

describe('damascusCitationStyleIssues', () => {
  const content = (body: string, refCount = 0): ConstructorContent => ({
    defaultDir: 'ltr',
    sections: [
      { id: 'p1', kind: 'paragraph', html: `<p>${body}</p>` },
      {
        id: 'refs',
        kind: 'references',
        items: Array.from({ length: refCount }, (_, i) => ({
          lang: 'en' as const,
          html: `<p>Ref ${i + 1}.</p>`,
        })),
      },
    ],
  });
  const authorYear = content(
    '(Smith, 2020) and (Jones, 2019) and (المقدسي، 2018) are cited.',
  );
  const numbered = content('[1] and [2] and [3, 4] are cited here.', 4);

  it('warns a Vancouver (medical) journal using author–year citations', () => {
    const issues = damascusCitationStyleIssues('vancouver', authorYear);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Vancouver');
  });

  it('accepts a Vancouver journal numbered in order of first citation', () => {
    expect(damascusCitationStyleIssues('vancouver', numbered)).toEqual([]);
  });

  it('warns an APA journal using numbered citations', () => {
    const issues = damascusCitationStyleIssues('apa', numbered);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('APA');
  });

  it('accepts an APA journal using author–year citations', () => {
    expect(damascusCitationStyleIssues('apa', authorYear)).toEqual([]);
  });

  it('skips when the journal (and so the style) is unknown', () => {
    expect(damascusCitationStyleIssues(null, numbered)).toEqual([]);
  });

  it('does not judge the style from fewer than 3 citations', () => {
    const twoOnly = content('(Smith, 2020) and (Jones, 2019).');
    expect(damascusCitationStyleIssues('vancouver', twoOnly)).toEqual([]);
  });

  it('flags Vancouver numbers that are not in order of first citation', () => {
    const issues = damascusCitationStyleIssues(
      'vancouver',
      content('First [2], then [1], then [3].', 3),
    );
    expect(issues).toEqual([
      expect.stringContaining('[2] appears where [1] is expected'),
    ]);
  });

  it('expands ranges when checking Vancouver order', () => {
    expect(
      damascusCitationStyleIssues(
        'vancouver',
        content('See [1–3], then [4] and [2].', 4),
      ),
    ).toEqual([]);
  });

  it('flags a Vancouver number past the end of the reference list', () => {
    const issues = damascusCitationStyleIssues(
      'vancouver',
      content('[1] and [2] and [3].', 2),
    );
    expect(issues).toEqual([
      expect.stringContaining('Citation [3] has no reference'),
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Worst-case manuscript — everything wrong
// ─────────────────────────────────────────────────────────────────────────────

describe('damascusFormatIssues — worst-case invalid manuscript', () => {
  it('reports all major errors for a completely empty content', () => {
    const emptyContent: ConstructorContent = {
      defaultDir: 'rtl',
      sections: [],
    };
    const check = checkDamascusStructure(emptyContent);
    const issues = damascusFormatIssues(check);

    // Both titles missing
    expect(issues.some((i) => i.includes('English title'))).toBe(true);
    expect(issues.some((i) => i.includes('Arabic title'))).toBe(true);
    // Authors missing
    expect(issues.some((i) => i.includes('No authors listed'))).toBe(true);
    // Abstracts missing
    expect(issues.some((i) => i.includes('Missing English abstract'))).toBe(
      true,
    );
    expect(issues.some((i) => i.includes('Missing Arabic abstract'))).toBe(
      true,
    );
    // Keywords missing
    expect(
      issues.some((i) => i.includes('Missing keywords for the English')),
    ).toBe(true);
    expect(
      issues.some((i) => i.includes('Missing keywords for the Arabic')),
    ).toBe(true);
    // IMRaD missing
    expect(issues.some((i) => i.includes("'Introduction'"))).toBe(true);
    expect(issues.some((i) => i.includes("'Literature Review'"))).toBe(true);
    expect(issues.some((i) => i.includes("'Materials and Methods'"))).toBe(
      true,
    );
    expect(issues.some((i) => i.includes("'Results and Discussion'"))).toBe(
      true,
    );
    expect(issues.some((i) => i.includes("'Conclusions'"))).toBe(true);
    // References missing
    expect(issues.some((i) => i.includes('No references section'))).toBe(true);
    // At least 13 distinct issues
    expect(issues.length).toBeGreaterThanOrEqual(13);
  });

  it('produces all author-field errors for an authors section with blank fields', () => {
    const badAuthors: ConstructorContent = {
      defaultDir: 'rtl',
      sections: [
        {
          id: 'authors',
          kind: 'authors',
          authors: [
            {
              fullName: 'باحث مجهول',
              title: '',
              email: '',
              affiliation: '',
              isCorresponding: false,
            },
          ],
        },
      ],
    };
    const check = checkDamascusStructure(badAuthors);
    expect(check.authorsWithoutEmail).toContain('باحث مجهول');
    expect(check.authorsWithoutAffiliation).toContain('باحث مجهول');
    expect(check.authorsWithoutTitle).toContain('باحث مجهول');
    expect(check.hasCorrespondingAuthor).toBe(false);

    const issues = damascusFormatIssues(check);
    expect(issues.some((i) => i.includes('corresponding author'))).toBe(true);
    expect(issues.some((i) => i.includes('email address'))).toBe(true);
    expect(issues.some((i) => i.includes('institution/affiliation'))).toBe(
      true,
    );
    expect(issues.some((i) => i.includes('academic title/rank'))).toBe(true);
  });

  it('produces all keyword errors at once for a bad abstract', () => {
    const badAbstractContent: ConstructorContent = {
      ...compliantContent,
      sections: compliantContent.sections.map((s) => {
        if (s.kind === 'abstract' && s.lang === 'en') {
          return { ...s, text: 'Short abstract.', keywords: 'alpha, beta' };
        }
        if (s.kind === 'abstract' && s.lang === 'ar') {
          return {
            ...s,
            text: 'ملخص قصير.',
            keywords: 'كلمة, كلمتان, ثلاثة, أربعة, مفقود',
          };
        }
        return s;
      }),
    };
    const issues = damascusFormatIssues(
      checkDamascusStructure(badAbstractContent),
    );
    // Too few English keywords
    expect(issues.some((i) => i.includes('2 keyword(s)'))).toBe(true);
    // English keywords not in text
    expect(
      issues.some((i) => i.includes('do not appear in the English abstract')),
    ).toBe(true);
    // Arabic keywords not in text
    expect(
      issues.some((i) => i.includes('do not appear in the Arabic abstract')),
    ).toBe(true);
  });
});
