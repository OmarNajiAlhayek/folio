import {
  buildBodyPlainText,
  checkDamascusStructure,
  damascusFormatIssues,
  extractInlineCitations,
  extractReferenceList,
} from './submission-copyedit-text.util';
import type { ConstructorContent } from './constructor-content.types';

const sampleContent: ConstructorContent = {
  sections: [
    { kind: 'abstract', lang: 'en', text: 'English abstract.' },
    { kind: 'abstract', lang: 'ar', text: 'ملخص عربي.' },
    {
      kind: 'heading1',
      text: 'Introduction',
      presetSourceId: 'introduction',
    },
    {
      kind: 'heading1',
      text: 'Literature Review',
      presetSourceId: 'literatureReview',
    },
    {
      kind: 'heading1',
      text: 'Materials and Methods',
      presetSourceId: 'materialsAndMethods',
    },
    {
      kind: 'heading1',
      text: 'Results and Discussion',
      presetSourceId: 'resultsAndDiscussion',
    },
    {
      kind: 'heading1',
      text: 'Conclusions',
      presetSourceId: 'conclusions',
    },
    {
      kind: 'paragraph',
      html: '<p>Prior work (Smith, 2020) is cited. See also [2].</p>',
    },
    {
      kind: 'references',
      items: [
        { html: '<p>Smith J. Example. 2020.</p>' },
        { html: '<p>Jones A. Other. 2019.</p>' },
      ],
    },
  ],
};

describe('submission-copyedit-text.util', () => {
  it('extracts inline citations and reference plain text', () => {
    expect(extractInlineCitations(sampleContent)).toContain('(Smith, 2020)');
    expect(extractInlineCitations(sampleContent)).toContain('[2]');
    expect(extractReferenceList(sampleContent)).toHaveLength(2);
    expect(extractReferenceList(sampleContent)[0]).toMatch(/Smith/);
  });

  it('builds body plain text without references section', () => {
    const body = buildBodyPlainText(sampleContent);
    expect(body).toMatch(/Smith, 2020/);
    expect(body).not.toMatch(/Jones A\. Other/);
  });

  it('reports no Damascus format issues for a complete sample', () => {
    const check = checkDamascusStructure(sampleContent);
    expect(damascusFormatIssues(check)).toEqual([]);
  });

  it('flags missing Arabic abstract', () => {
    const partial: ConstructorContent = {
      sections: [
        { kind: 'abstract', lang: 'en', text: 'Only English.' },
        { kind: 'references', items: [{ html: '<p>Ref</p>' }] },
      ],
    };
    const issues = damascusFormatIssues(checkDamascusStructure(partial));
    expect(issues.some((i) => i.includes('Arabic abstract'))).toBe(true);
  });
});
