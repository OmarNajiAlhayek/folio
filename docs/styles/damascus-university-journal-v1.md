# Damascus University Journal — author template (`damascus-university-journal-v1`)

Source: the journal's nine-page author guideline, "قالب البحث لنشر مقال في جامعة دمشق", kept in this folder as [`page-1.jpg`](./damascus-university-journal-v1/page-1.jpg) … [`page-9.jpg`](./damascus-university-journal-v1/page-9.jpg). The same template as a Word file is the test fixture [`backend/src/submissions/__fixtures__/damascus-author-template.docx`](../../backend/src/submissions/__fixtures__/damascus-author-template.docx). Page references below (p.N) point at those images.

The executable version is [`damascus-university-journal-v1.profile.ts`](../../backend/src/manuscript-styles/profiles/damascus-university-journal-v1.profile.ts). Each rule below says where the app applies it:

- **Generated** — the Word constructor's `.docx` output follows it ([`docx-generator.service.ts`](../../backend/src/submissions/docx-generator.service.ts)).
- **Upload: error / warning** — checked on an uploaded `.docx` ([`docx-format-checker.ts`](../../backend/src/submissions/docx-format-checker.ts)). Errors block submission; warnings are shown on the manuscript card only.
- **Pre-submit** — reported by the Damascus structure check before submission ([`submission-copyedit-text.util.ts`](../../backend/src/submissions/submission-copyedit-text.util.ts)).
- **Submit** — enforced by the submission form ([`submission-lifecycle.service.ts`](../../backend/src/submissions/submission-lifecycle.service.ts)).
- **Author** — not machine-checkable; left to the author and copyeditor.

## 1. Page setup (p.3)

| Rule | Value | Where |
|---|---|---|
| Paper | A4 | Generated |
| Margins | top 3 cm; bottom, left, right 2 cm | Generated · Upload: error |
| Header distance | 1.8 cm from the top | Generated · Upload: warning |
| Footer distance | 0.6 cm from the bottom | Generated · Upload: warning |
| Header/footer options | **Different first page** on; different odd and even pages **off** | Generated · Upload: warning (first page) |
| Line spacing | Single; 0 cm indents; 0 pt before and after | Generated · Upload: error |
| Line numbers | Every line, counted continuously; **left** side for Arabic articles, **right** side for English articles | Generated · Upload: warning |

Word draws line numbers on the right only in a right-to-left section, so an English article's section is marked right-to-left. The generator adds that marker itself, because the `docx` library has no option for it.

Header and footer ends measured from the template: header 1021 twips, footer 340 twips, line-number distance 255 twips.

## 2. Headers and footers (p.1–2)

| Page | Header | Footer |
|---|---|---|
| 1 | Two columns: "Damascus university journal / V… ( ):PP: ??-??" on the left, "مجلة جامعة دمشق للعلوم .... / المجلد (العدد): الصفحات: ؟؟ - ؟؟ ." on the right, then a rule | "1 من 9" page count beside "ISSN (online)" and the journal site |
| 2 onward | Article title in the article's language, then the authors' surnames (كنية الباحث الأول، كنية الباحث الثاني …), then a rule | "N من M" |

Volume, issue and page range stay as placeholders until the article is placed in an issue. When the manuscript belongs to a journal, the generator prints that journal's Arabic and English names and its online ISSN.

## 3. Typography (p.4)

| Element | Font | Size | Weight | Where |
|---|---|---|---|---|
| Arabic text | Simplified Arabic | 12 | regular | Generated · Upload: error |
| Latin text | Times New Roman | 11 | regular | Generated · Upload: error |
| Main title (both languages) | per script | 16 | bold | Generated · Upload: warning |
| Every subheading | per script | 14 | bold | Generated · Upload: warning |
| Table and figure captions | per script | 10 | bold | Generated |
| Table cells and table notes | per script | 10 | regular | Generated |
| Footnotes | per script | 10 | — | Generated · Upload: warning |

The upload check measures what Word actually applies to the running text, weighted by letter count: direct formatting, then the paragraph style chain, then document defaults and theme fonts. It skips tables, text boxes, headings and superscripts. Reading only the Normal style would flag the journal's own template, which leaves Normal at Word defaults (Palatino / Calibri) and formats the text directly.

Word sizes a run marked right-to-left with its complex-script size for every character. The generator therefore splits mixed text into per-script runs, so a Latin word inside Arabic text prints in Times New Roman 11.

**Punctuation (p.4):** no space between a punctuation mark and the word before it, inside brackets, or inside quotation marks. Pre-submit.

## 4. Title, authors and abstracts (p.1–2)

Page 1 is in the article's language; page 2 repeats the block in the other language (English or French for an Arabic article); the body starts on page 3. Generated.

- **Title** — 16 bold, start-aligned. The first letter of each word in the English title is capitalised (p.2). Pre-submit.
- **Author line** — each author's first name and surname (p.2: "اسم الباحث أي اسم الأول وكنيته"), preceded by the abbreviated academic title (م.، د.، أ.د.) and followed by a superscript number. Generated.
- **Corresponding author** — an asterisk (*) on that author's name, whatever the author order. Generated · Submit (exactly one).
- **Affiliation lines** — one per author: superscript number, academic title, research centre or university, precise specialisation (التخصص الدقيق), email. Damascus University researchers use their university email. Generated (the constructor has a specialisation field) · Pre-submit (email, affiliation, title present).
- **Abstract** — at most 300 words, one in Arabic and one in the other language. Submit · Pre-submit.
- **Keywords** — five per abstract, each appearing in that abstract; English keywords capitalised. Submit (exactly five) · Pre-submit (present in abstract, capitalisation).
- **Side box** — "تاريخ الإيداع / تاريخ القبول", the CC BY-NC-SA badge and "حقوق النشر: جامعة دمشق – سورية، يحتفظ المؤلفون بحقوق النشر بموجب CC BY-NC-SA" beside the Arabic abstract (right side); "Received / Accepted / Copyright: Damascus University- Syria, The authors retain the copyright under a CC BY-NC-SA" beside the English abstract (left side). Generated.
- **Length** — the article does not exceed 25 pages (p.1). Pre-submit (≈7,500-word estimate). Uploaded files are not page-counted: `docProps/app.xml` page counts are unreliable.

## 5. Article outline (p.4, p.6–7)

1. **المقدمة (Introduction)** — the topic and the article's aims.
2. **الدراسات المرجعية (Literature Review)** — related studies compared by method, tools and findings. Writing up each earlier study separately is not allowed.
3. **مواد البحث وطرائقه (Materials and Methods)** — for scientific studies, the materials and methods; for humanities studies, the population, sample and data-collection tools.
4. **النتائج والمناقشة (Results and Discussion)**
5. **الاستنتاجات** — brief, in numbered paragraphs. The template labels this section "(Discussion)"; the app treats it as Conclusions.
6. **قائمة المراجع (References)** — at the end of the article.

Presence of each section and numbered conclusions: Pre-submit.

## 6. Tables and figures (p.6–7)

- **Tables** — numbered in order of appearance; caption **above** the table, centred, bold 10: "الجدول (1) نتيجة التجربة الأولى" ("Table (1) …" in English sections). Explanatory text or the source goes below in regular 10, introduced by "حيث إن:". Horizontal rules only: heavy top and bottom, thin between rows, no vertical lines. Generated · Pre-submit ("حيث إن:").
- **Figures** — numbered in order; caption **below** the figure in bold 10: "الشكل (1) …". Symbol explanations and the source of a borrowed figure also go below. Generated.
- **Footnotes** — a superscript number on the term, explanation at the foot of the page in size 10 (p.6). Generated.

## 7. In-text citations (p.5–6)

Two forms:

- **Narrative** — surname outside the brackets, year inside, page at the end of the quotation: عرّف المقدسي (2020) … (118).
- **Parenthetical** — at the end of the sentence: (المقدسي، 2020، 118).

Rules:

1. Surname, year, page — **without** "ص" or "p". Right-to-left for Arabic sources, left-to-right for foreign ones: (Elias,2020,13)، (عبد الرحمن، 2021، 15). Pre-submit (flags "ص"/"p").
2. More than one author: the first author's surname, then "وآخرون" in Arabic or italic "et al.," in English: (خليفة وآخرون، 2019، 64)، (Grass et al., 2022,75).
3. No author: the first two words of the title, then (year), page.
4. Same author, same year: "أ" / "ب" or "a" / "b". The letter "أ" goes to the title that comes first alphabetically.
5. Several sources in one citation: in alphabetical order, not by year, separated by semicolons.
6. Two authors with the same surname: the full name in Arabic; the first initial and the surname in English.
7. Organisations: the full name with the abbreviation the first time, then the abbreviation only.
8. Quranic verses: fully vowelled, cited as [السورة، الآية: N].
9. Translated works: the original author (not the translator), then original year / translation year: (بيتر، 1995/ 2005).
10. Several works by the same author: the surname once, then the years from oldest to newest: (عامر، 2019، 2020، 2023).
11. Secondary sources: (قسيس، 1991، كما ورد لدى عبد الوهاب، 2008، 12).
12. Websites and software in brackets: (http://www.mohe.gov.sy)، (SPSS الإصدار 21).

Rules 2–12 are left to the author and copyeditor.

**Citation style by journal** (editorial decision, see [Not from this guideline](#not-from-this-guideline)): the forms above are **APA** and apply to every journal except the medical journal (مجلة العلوم الطبية), which uses **Vancouver** — a number in square brackets, [1], [1,3] or [4–6], assigned in order of first citation. The submission's journal decides; the rule is `references.citationStyles` in the profile. Upload check (warning) · Pre-submit (style, and for Vancouver the numbering order and numbers past the end of the list) · AI reference check.

## 8. Reference list (p.7–9)

- APA journals: Arabic references first, then foreign ones; each group alphabetical (أ→ي, A→Z). Generated · Pre-submit.
- Vancouver (medical journal): the order of first citation, so the generated list keeps the author's order — sorting would repoint every [n] in the text. Generated.
- The entries are **numbered**. Generated.
- Every type of source goes in one list.
- Only works cited in the text are listed. Author.
- A DOI goes at the end of the entry as `https://doi.org/10.21608/…`. Generated (from the entry's DOI field, unless the entry text already contains it).
- Titles of books, theses, conference papers, seminars, journals, blogs, videos and social-media posts are **italic**, not bold or underlined. Author (the reference editor supports italics).
- Same author: single-author works first, then co-authored ones alphabetically by co-author; oldest to newest; same year distinguished by letters.

Entry patterns (p.8–9):

| Source | Pattern |
|---|---|
| Book, one author | الكنية، الاسم الأول. (سنة النشر). *عنوان الكتاب*. ط: رقم الطبعة، الناشر. عدد الصفحات. |
| Book, two to six authors | As above, with a comma and "و" before the last author, in title-page order. |
| Book, more than six authors | The first six, then "وآخرون". |
| Translated book | …(سنة النشر). *عنوان الكتاب*. ترجمة: اسم المترجم غير معكوس. الناشر: عدد الصفحات. |
| Chapter in an edited book | مؤلف الفصل. (سنة النشر). عنوان الفصل. تحرير: اسم المحرر. *عنوان الكتاب*. ط: صفحة البداية–النهاية. الناشر. |
| Journal article | الكنية، الاسم الأول. (سنة النشر). عنوان البحث. *اسم المجلة*، المجلد (العدد): صفحة البداية–النهاية. |
| Newspaper article | الكنية، الاسم الأول. (سنة النشر، اليوم، الشهر). عنوان المقالة. *اسم الصحيفة*. العدد: الصفحات. |
| Online article | كنية الناشر، الاسم الأول. (سنة النشر). *عنوان المقالة*. اسم الموقع. تاريخ الاسترجاع. الرابط. |
| Conference or seminar paper | كنية الباحث، الاسم الأول. (تاريخ الانعقاد). *عنوان المساهمة*. اسم الندوة أو المؤتمر. البلد. |
| Master's or doctoral thesis | كنية الباحث، الاسم الأول. (سنة الإنجاز). *عنوان الرسالة*. الدرجة. القسم. الكلية. الجامعة. قاعدة البيانات والرابط. |

## Not from this guideline

- **Columns by faculty** (two columns for engineering) and **citation style by journal** come from separate editorial decisions, not these nine pages. Citation style: APA for every journal, Vancouver for the medical journal, keyed by the submission's journal (not the classifier's disciplines). The upload check reports a mismatch as a warning only: detection is heuristic, and the journal's published engineering articles use numbered citations.
- **Minimum journal self-citations** (`minJournalSelfCitations: 2`) is a journal policy enforced at submit time.

## Checked against published articles

The upload check was run over the official template and 19 articles the journal accepted (`Damascus_Articles/`, not in git). The template produces no blocking violations. Two articles are blocked, both for genuine deviations: `129-157` has a 2 cm top margin and 10.5 pt Latin text, and the body section of engineering article `1-10` uses Word's default 2.54 cm margins. Every published article draws warnings for its 3 cm header/footer distance and missing line numbers, because the journal strips line numbers at layout. That is why those rules only warn.
