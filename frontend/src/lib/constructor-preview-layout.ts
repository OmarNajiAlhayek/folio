import type {
  AbstractSection,
  AuthorsSection,
  ConstructorContent,
  ConstructorDir,
  ConstructorSection,
  TitleSection,
} from './constructor-content.types';

/**
 * One block of the preview. Front-matter blocks carry the language they are laid
 * out in, because the same authors section appears once per language page.
 */
export type PreviewLayoutItem = {
  key: string;
  section: ConstructorSection;
  /** Set for front-matter blocks: the language page they belong to. */
  lang?: 'ar' | 'en';
  /** Starts a new page in the generated `.docx`. */
  pageBreakBefore?: boolean;
};

const ARABIC = /\p{Script=Arabic}/gu;
const LATIN = /\p{Script=Latin}/gu;

function bodyText(section: ConstructorSection): string {
  if (
    section.kind === 'heading1' ||
    section.kind === 'heading2' ||
    section.kind === 'heading3'
  ) {
    return section.text;
  }
  return 'html' in section ? section.html.replace(/<[^>]+>/g, ' ') : '';
}

/**
 * The article language, judged on body text like the `.docx` generator does, so
 * drafts saved with the old left-to-right default still preview as Arabic.
 */
export function detectArticleDir(content: ConstructorContent): ConstructorDir {
  let arabic = 0;
  let latin = 0;
  for (const s of content.sections) {
    const text = bodyText(s);
    arabic += text.match(ARABIC)?.length ?? 0;
    latin += text.match(LATIN)?.length ?? 0;
  }
  if (arabic === 0 && latin === 0) return content.defaultDir;
  return arabic >= latin ? 'rtl' : 'ltr';
}

const hasLetters = (text: string | undefined) => Boolean(text && /\p{L}/u.test(text));

/**
 * Section order as the `.docx` lays it out. With a bilingual front matter the
 * article-language title, authors and abstract come first, the other language
 * follows on its own page, and the body starts on the next page; otherwise
 * sections keep the author's order.
 */
export function layoutPreviewSections(
  content: ConstructorContent,
  bilingualFrontMatter: boolean,
): PreviewLayoutItem[] {
  if (!bilingualFrontMatter) {
    return content.sections.map((section) => ({ key: section.id, section }));
  }

  const titles: Partial<Record<'ar' | 'en', TitleSection>> = {};
  const abstracts: Partial<Record<'ar' | 'en', AbstractSection>> = {};
  let authors: AuthorsSection | undefined;
  const frontIds = new Set<string>();
  for (const s of content.sections) {
    if (s.kind === 'title') {
      const lang = s.lang === 'ar' ? 'ar' : 'en';
      if (!titles[lang]) {
        titles[lang] = s;
        frontIds.add(s.id);
      }
    } else if (s.kind === 'authors' && !authors) {
      authors = s;
      frontIds.add(s.id);
    } else if (s.kind === 'abstract' && !abstracts[s.lang]) {
      abstracts[s.lang] = s;
      frontIds.add(s.id);
    }
  }

  const primary = detectArticleDir(content) === 'rtl' ? 'ar' : 'en';
  const items: PreviewLayoutItem[] = [];
  for (const lang of [primary, primary === 'ar' ? 'en' : 'ar'] as const) {
    const blocks: ConstructorSection[] = [];
    for (const s of [titles[lang], authors, abstracts[lang]]) {
      if (s) blocks.push(s);
    }
    if (!hasLetters(titles[lang]?.text) && !hasLetters(abstracts[lang]?.text)) {
      continue;
    }
    blocks.forEach((section, i) =>
      items.push({
        key: `${lang}:${section.id}`,
        section,
        lang,
        pageBreakBefore: i === 0 && items.length > 0,
      }),
    );
  }

  const bodyStartsNewPage = items.length > 0;
  content.sections
    .filter((s) => !frontIds.has(s.id))
    .forEach((section, i) =>
      items.push({
        key: section.id,
        section,
        pageBreakBefore: i === 0 && bodyStartsNewPage,
      }),
    );
  return items;
}

/** Caption label: "الجدول (1) caption" or "Table 1: caption". */
export function previewCaption(
  words: { rtl: string; ltr?: string },
  numberFormat: 'colon' | 'parenthesized' | undefined,
  num: number,
  caption: string,
  dir: ConstructorDir,
): string {
  const word = dir === 'ltr' ? (words.ltr ?? words.rtl) : words.rtl;
  const text = caption.trim();
  if (numberFormat === 'parenthesized') {
    return text ? `${word} (${num}) ${text}` : `${word} (${num})`;
  }
  return text ? `${word} ${num}: ${text}` : `${word} ${num}`;
}
