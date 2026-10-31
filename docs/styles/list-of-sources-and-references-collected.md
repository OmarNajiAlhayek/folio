# List of sources and references — collected rules

Data collected for the uploaded-Word check of **قائمة المصادر والمراجع**. This file records what the five university guides actually say. It does not choose a winner where they disagree, and it does not change the journal profile.

The journal article template is a different document. Its reference-list rules stay in [damascus-university-journal-v1.md](./damascus-university-journal-v1.md) and in `تنسيقات جامعة دمشق.md`. Several rules below contradict that template (italics versus bold-and-underline, `ص` / `p`, grouping by type, footnotes versus author–year). A later implementation has to decide which corpus the Word check enforces.

## Sources

PDFs saved from the Internet Archive snapshot (5 October 2025) of [مديرية البحث العلمي، تحميل دليل كتابة الأطروحة الجامعية](https://damascusuniversity.edu.sy/srd/index.php?lang=1&set=3&id=632). Local copies: `Downloads/damascus-university-guides/`. Page numbers below are PDF pages.

| Id | File | PDF pages | What it contributes |
|---|---|---|---|
| T | دليل كتابة الأطروحة الجامعية، الإصدار 2021 | 50 | The university thesis guide. Three documentation systems, then an APA-labelled entry catalogue and the list layout. |
| A | دليل الكتابة العلمية والتوثيق وفق APA، الإصدار السادس (كلية التربية) | 31 | Arabic application of APA 6: in-text cases and reference-list cases, type by type. |
| P | توثيق المصادر بأسلوب APA، اعتماد مختبر الكتابة بجامعة بوردو | 27 | Short slide deck. Fewer types, a few extra cases (personal communication, chapter locator, bare URL). |
| S | دليل إعداد الأبحاث العلمية لطلاب الدراسات العليا في كلية الشريعة، 2022 | 72 | Sharia college only. Footnotes, title-first entries, Quran first in the list. |
| R | إجراءات القيد في الدراسات العليا … إصدار 2022 | 32 | No entry patterns. The defence rubric scores the list. Formatting is delegated to T. |

Arabic in T, A, P, and R extracted in reading order. S stored many words with the lam shifted (احلواشي for الحواشي). S examples below are restored to the words the surrounding sentences require. Digit order inside S examples was ambiguous in the extract; the examples keep the order that matches «الجزء والصفحة».

## The check has to know which system the file is in

T splits documentation by field before it ever reaches the list (T pp. 25–28, 39–40).

| System | Who | In the text | The list |
|---|---|---|---|
| Footnotes | Humanities, law, arts | Superscript Arabic numeral. Source is in the footnote, not in parentheses. | Built from those notes. T tells the writer to shorten the note from the list entry. |
| Author–date | Engineering and sciences, first method | Surname and year in parentheses, or the surname in the sentence and the year in parentheses. | One alphabetical list. Every in-text work has an entry. |
| Order of citation | Engineering and sciences, second method | `[1]` after the sentence, or a superscript `1`. T forbids `كما ورد في المرجع [1]` and `كما ورد في ]1[`. | List order is first appearance. Language and source type do not reorder it. |

A and P assume author–date only. S assumes footnotes only, and renumbers footnotes from 1 on each page. R says the printed list must match every work the thesis used, and that the thesis must follow T for margins, numbering, and footnotes.

## Conflicts that change a pass/fail

These are the places a single rigid checker will reject a file that one of the guides accepts.

| Topic | T | A | P | S |
|---|---|---|---|---|
| List heading | المراجع / References, and also قائمة المصادر (ببليوغرافيا) | قائمة المراجع / References, centred | References / صفحة المراجع | المصادر والمراجع, centred on its own sheet |
| What goes in | Works used, and works the writer expects to use later | Works cited in the body. A separate قائمة المصادر may hold works read but not cited | Every retrievable cited work appears, and every list entry is cited | Only works that appear in the footnotes |
| Order | Arabic, then foreign, then a third block of websites. Inside Arabic and foreign, group by type once a type has more than three entries. Alphabetical by family name inside the group. Numbered style ignores language and type | Arabic block, then foreign block. Flat alphabetical order. Do not group into books, journals, and so on | Alphabetical sample; Arabic and English examples are shown separately | Arabic, then foreign. Quran first, with no number. Alphabetical, ignoring ال and ابن and أب/أبو |
| Title styling | Bold and underlined | Italic. A says APA 6 replaced bold and underline with italic. Italic for book titles, journal names, thesis titles | Italic for book, thesis, journal, volume, conference paper | Not specified as italic or bold |
| Author count, in text | Fewer than six: all names, و before the last. More than six: first surname + وآخرون. Exactly six is not stated in the footnote rule | pp. 10 and 13–14 disagree with each other. See the matrix below | Six or more: `et al` from the first mention | Contemporary book: 1, 2, or 3 names in cover order. More than three: first name + وآخرون |
| Author count, list | Up to six: all names. More than six: first six, then وآخرون. English uses `&` before the last | Up to seven named; from eight authors the pages disagree (first 7 … last, or first 6 … last) | Examples name every author they show | List entries name the authors; the «وآخرون» cutoff is stated for the footnote, not restated for the list |
| Page in the citation | `ص: رقم الصفحة`, and `(د ت)` when there is no date | `ص` or `p`. Required for a quotation or a close paraphrase. A web page with no pages uses `para.` | `ص` and `p.` inside the citation | Volume/page or `ص` in the footnote, in parentheses. No `ص:` label in the Sharia pattern |
| Missing date | `(د.ت.)`, English `n.d.` In the footnote examples the dots are omitted: `(د ت)` | `(د.ت)` and `n.d.` One table cell also writes `ب ت` | Not shown | Not shown |
| Missing publisher | `(د. ن.)` | Not shown | Not shown | Not shown |
| Indent of a wrapped entry | Not specified on the Arabic list. English references: single spacing inside the entry, 1.5 between entries | Hanging indent of 5 spaces (Ctrl+T). Double spacing. No blank line between entries | Not specified | Continuation line indented 0.8 cm (five spaces) |
| Footnote numbers | Continuous from the start of the thesis to the end. Superscript. No asterisk and no angle brackets for footnote calls | Not the documentation method | Not used | Start again at 1 on every page. The call is a superscript Arabic numeral in parentheses. The note number sits in larger parentheses |
| Repeat of the same work | Consecutive reuse: `(المرجع السابق، ص: …)` | Not an ibid form. Repeat by author–date, with `وآخرون` / `et al.` after the first full mention when the count rule says so | Not an ibid form | Same page, immediately again: `المصدر نفسه` or `المرجع نفسه` plus the new page. A later journal citation may drop the journal name and keep title, author, and pages |
| Translated work | Original author, inverted. Translator's name not inverted. Year is the publication year of the edition used | In text, the translation's author–date. List: translator not inverted, noted as مترجم. English example also gives original-work year | Not shown | Not shown |
| Secondary source | Not given as its own pattern | Cite the work you read. The list contains that work only | «ورد في» / `as cited in` | Take the text from the book that carries it; the footnote names that book |
| Personal communication | Recorded interview has a list entry | Not given | In-text only in the example: `(C. E. Koop، اتصال شخصي، مايو 16, 1998)`. No list line is shown | Personal interview has a footnote and no separate list pattern |

### Author-count matrix, as each page states it

| Authors | T footnote (p. 27) | T list, books (p. 33) | A in text | A reference list | S footnote, modern book | P in text |
|---|---|---|---|---|---|---|
| 1 | full name | full name | full, every time | full | full | full |
| 2 | all, و before the last | all, و before the last | both, every time | all | both, cover order | — |
| 3 | all | all | A p. 10: all on first mention, then first + وآخرون / `et al.` A p. 13 table: same for its "3 authors" row | all | all, cover order | — |
| 4–5 | all | all | same as 3 on A p. 10 | all | first + وآخرون | — |
| 6 | not stated (the sentence jumps from "fewer than six" to "more than six") | all | A p. 10: all, then et al. A p. 14: more than six uses et al. from the first mention | all | first + وآخرون | `(Smith et al, 1998)` |
| 7 | first surname + وآخرون | first six + وآخرون | A p. 13: more than seven uses et al. from the first mention | A p. 18: one to seven, write every name | first + وآخرون | et al. |
| 8 or more | first surname + وآخرون | first six + وآخرون | et al. from the first mention | A p. 12: first seven, comma, `...`, last author. A p. 18: first six, `...`, last author | first + وآخرون | et al. |

English list entries in T use `&` before the last author. A uses `&` in the reference list and `and` when the names are part of the sentence.

## Scenario index

Each row is a case the guides put on the writer. The feature that closes this check has to accept or flag the case under the system it was told to apply.

### The list as a block

1. Heading is قائمة المراجع or References (A, T contents). T also calls the same block قائمة المصادر (ببليوغرافيا). S uses المصادر والمراجع.
2. The heading is centred (A). S puts it on a sheet of its own, inside a rounded rectangle, and that sheet has no page number.
3. A thesis list starts on its own page. A journal article keeps it as its own part, not necessarily a new page (A p. 27).
4. Arabic entries precede foreign entries (A, T, S), except T's numbered system, which follows first citation and mixes languages.
5. T adds a third block: website names and URLs, classified by author.
6. T splits Arabic and foreign blocks into types (books, encyclopedias and dictionaries, theses, conferences and workshops, periodicals, documents, maps, pictures) when a type has more than three entries.
7. A forbids grouping: no "books" subheading, no "journals" subheading.
8. Inside an alphabetical group, sort by family name and ignore the definite article ال (T). S also ignores ابن and أب/أبو. S starts the line with the book title, so the sort key (title or author) is not explicit.
9. Same author: undated or dated works from oldest year to newest (T). A adds: a single-author entry before a co-authored entry with the same first author.
10. Two works, same author, same year: أ / ب in Arabic, a / b in English, assigned by alphabetical title (T, A).
11. No author: the entry and the citation open with the title. Sort by that title. Italic when the work is a book (A).
12. An organisation is not inverted: وزارة التخطيط, Australian Bureau of Statistics (T, A).
13. Academic titles are dropped: no دكتور, no مهندس (T).
14. An Arabic three- or four-part name is written العائلة، الاسم الأول فالأب فالجد (T). A Latin name is `Family, S. J.`
15. Only cited works (A, P, S) versus cited works plus works the writer expects to use (T p. 39). A also defines قائمة المصادر as the wider unread-in-the-text list, distinct from قائمة المراجع.
16. Names in the body and names in the list are the same string (A p. 27).
17. Punctuation sits against the preceding word; one space follows it (T). The Arabic comma is ، and the English comma is `,`.
18. A wrapped entry hangs: 5 spaces (A), 0.8 cm (S).
19. Line spacing of the list: double, and no gap between entries (A). T's English instructions: single spacing inside an entry, one and a half between entries.
20. The list is numbered in T's samples and in T's "رقم وفق تسلسلها الهجائي". A's model is unnumbered.
21. S places the list after the appendices and before the English abstract. S's earlier chapter also places indexes (آيات، أحاديث، آثار، أعلام، مصطلحات، محتوى) after the list and before the English abstract.
22. Appendices are cited, and they come after the list in T and A. S puts appendices before the list.

### In-text shapes that the list has to match

23. Narrative: surname outside, year in parentheses. Parenthetical: surname, year, and page inside one pair (A, P, T's author–date method).
24. Citation may sit before the quotation or after it, and P says not both for the same quotation.
25. Page is required for a direct quotation and for a close paraphrase (A). A prefers a page on a summary too.
26. A web page without page numbers is cited with a paragraph number, `para.` (A).
27. Several works in one parenthesis are separated by semicolons (P). P's sample is `(Caruth, 1996; Fussell, 1975; Showalter, 1997)` and does not state an order.
28. Two authors, same surname: the initial distinguishes them, `(J. Smith, 1998)` and `R. Smith (1999)` (A, P).
29. Same author, several years: the surname once, years from oldest to newest, `Brown (1982, 1988)` (A).
30. Organisation, first mention: full name and the abbreviation, later mentions the abbreviation only (A: `[ABS], 1999` then `ABS`).
31. No author, in text: a short title in quotation marks, then the year, `("California," 1999)` and `("Building theories", 1999)` (A, P).
32. A long title is shortened in the text and written in full in the list (A).
33. Secondary source: `(Simpson, 1975, as cited in Cole, 1992, p. 71)`. The list entry is Cole, not Simpson (A). Two primary authors cited through one book: `Heath and Johnson (as cited in Morris, 1998, p. 25)`, and the list entry is Morris (A).
34. Personal communication stays in the text in P's example and has no list line.
35. A bare URL may be the whole citation: `(http://www.purdue.edu)` (P).
36. A chapter locator replaces the page: `(Jones, 1995, chap. 2)` (P).
37. Numbered system: `[1]`, or a superscript digit. Reuse of the same work keeps the same number. The list index equals that number (T).
38. Footnote system: the list is not what the reader uses to resolve the citation; the footnote is. The list still has to contain the work (S), or be abbreviable from the list (T).
39. T footnote, no author: the first two words of the title, then the year, then `, ص:`.
40. T footnote, no date: surname `(د ت), ص:`.
41. T footnote, same author and same year: `(1999- أ)` and `(1999- ب)`, and ألف goes to the title that comes first alphabetically.
42. Consecutive footnote reuse in T: `(المرجع السابق، ص: رقم الصفحة)`.
43. S, same source immediately again on the same page: `المصدر نفسه` or `المرجع نفسه` with the new location.
44. Quotation of four lines of prose or fewer, or three lines of poetry or fewer: quotation marks, source in the footnote (T, humanities). Longer: its own indented block, 1.27 cm from the right margin, double spaced, no quotation marks (T).
45. Quotation of 40 words or fewer: small quotation marks (A). More than 40 words: block, indented 1.27 cm, tighter line spacing, citation after the closing period (A). S: short quotation in `«...»`; more than 40 words as a block indented five characters on both sides, no quotation marks, closing period.
46. Words added to a quotation go in `[ ]`. Deleted words become `...` followed by a space (T, S).
47. A grammatical error kept from the source is marked `sic` in brackets (A) or `[هكذا]` (S).
48. Emphasis added by the writer is an underline plus `(التأكيد من قبل الباحث)` (S).
49. Brackets elsewhere in T's typesetting rules: ( ) for asides, non-Arabic names, and numbers; ﴿ ﴾ for Quran and hadith; [ ] for a reference inside the body; doubled small marks for a quotation. These compete with the numbered system's `[1]`.

### Entry types

50. Book, one author. T: `العائلة، الاسم. (السنة). العنوان [عريض وتحته خط]. ط: رقم. المدينة: الدولة. الناشر. ص: عدد صفحات الكتاب.` Edition omitted when it is the first or unknown. City and country both appear.
51. Book, two to six authors, cover order, not alphabetical order of the names (T).
52. Book, more than six authors (T).
53. Book written by an organisation (T): `المنظمة. (السنة). العنوان. المدينة: الدولة. الناشر. ص:`.
54. Translated book (T, A). Translator not inverted.
55. Chapter in an edited book (T, A, P). Editor not inverted. Page range of the chapter.
56. Chapter in a book with no editor (T).
57. Encyclopedia article with a signed author, including volume (T, A).
58. Encyclopedia article with no author: title first (T, A).
59. Whole edited encyclopedia (A): editor, `(Ed.)`, edition, volume range.
60. Journal article, with day and month when they exist (T). Volume `مج:` and issue `عدد:`. Page range `ص- ص: البداية-النهاية`. City, country, publisher follow in T. A uses `المجلد(العدد)` and does not repeat the city for a journal.
61. Journal article retrieved from ProQuest or another database that has a print original: T treats it as a periodical. A adds `Retrieved … from Database Name` and a document number.
62. Journal with a DOI (A): the DOI is the locator. A still says an electronic journal usually also gets a link.
63. Journal with no DOI: the journal URL (A). The URL is the publisher's, not the database record's, when A distinguishes them.
64. Journal with no volume and no issue: year and month, or a season (Spring), stand in that slot (A).
65. Article accepted, not yet paginated: `(in press)`, and no volume, issue, or pages (A).
66. Newspaper article, with the calendar date inside the year parentheses (T, A, P).
67. Newspaper article with no author: title first (A, P).
68. Magazine article, including a weekend magazine (A, P).
69. Web article. T: author, italic title, site name, retrieval date, URL. A p. 22: a normal web page is not underlined, and a retrieval date is not required because the page may change. A blog is the exception: retrieval day and month are wanted, because a blog is unstable (A p. 23).
70. Web page with no author (A, P).
71. Web page with no author and no date (A): title, `(n.d.)`, URL, italic title.
72. Electronic book, Kindle or ebrary, with the reader name in brackets and `Retrieved from` (A).
73. Book republished online: in text `1921/2007`; the list year is the online year, and `(Original work published 1921)` closes the entry (A).
74. Conference paper, published proceedings (T, A, P). T uses the meeting date as the date element. A says: if the publication year differs from the year the paper was delivered, write the publication year.
75. Conference paper published online (A).
76. Unpublished conference paper or seminar (A): month and year of delivery, `Paper presented at …`.
77. Master's or doctoral thesis (T, A). T wants degree, division, department, faculty, university, city, country, and page count. A marks it unpublished and names the university and its place. The title is italic in A and bold-underlined in T.
78. Ministry or research report, print (A). Online report whose author is not the publisher ends with `Retrieved from` and the URL (A). Author equals publisher: P and A use the organisation as author, and A's government sample ends with `Author`.
79. Several reports from the same organisation in the same year: `2000a`, `2000b`, `2000c` (A).
80. Government body, first mention with the abbreviation in brackets (A).
81. Artwork: artist, date, italic title, kind of work, city, country, where it is kept (T).
82. Recorded lecture, recorded interview, or recorded ceremony (T): speaker, full date, italic title, descriptive label, coordinator, city, archive.
83. Video or audio file, podcast episode, YouTube (A). If a YouTube clip has no author, the title takes the author slot. The uploader is named only when they are among the authors or producers.
84. Blog post (A), with retrieval date.
85. Facebook group page and a tweet (A). The tweet's author slot can be the account name. Date is the post date. `[Twitter post]` / `[Group page]` labels the kind.
86. Brochure and pamphlet (A): `[Brochure]` or `[Pamphlet]` after the title. `Author` when the organisation published its own leaflet.
87. Television series (A): producers in the author slot, `[Television series]`, city, network.
88. Dictionary, Sharia footnote only: title, famous name, (volume/page), مادة (entry). Repeat: `المصدر نفسه`.
89. Classical Sharia source, footnote: title, famous name, (volume/page). Repeat: `المصدر نفسه`.
90. Manuscript, footnote: title, famous name, folio and side, then مخطوط. List: title, author, library, shelf number, leaf count (S).
91. Hadith collection, footnote: title, book and chapter, (volume/page), (hadith number if numbered) (S).
92. Journal article, Sharia footnote: title in `«...»`, author, journal, (pages). A later citation of the same article drops the journal name (S).
93. Thesis, Sharia footnote: full title, researcher, رسالة ماجستير or أطروحة دكتوراه, (pages) (S).
94. Conference, magazine, newspaper, or website article, Sharia footnote: title, author, outlet, and for a site the visit or retrieval date (S).
95. Interview, Sharia footnote: topic, interviewer, interviewee, day, month, year. Covers a meeting and a phone call (S).
96. Statute, Sharia: article and paragraph in the body; the footnote carries the law's name, country, number, and year (S).
97. Sharia list, book: title, author or authors, editor, place: publisher, edition, date, volume count or page count (S).
98. Sharia list, chapter in an edited book: chapter title, chapter author, chapter pages, ضمن: book title, editor marked (محرر), place: publisher, edition, date, size (S).
99. Sharia list, thesis: title, researcher, kind, university: college: department, date, country, volumes or pages (S).
100. Sharia list, periodical: title in `«...»`, author, journal, issue numbering as printed on the journal, country, page range (S).
101. Sharia list, conference: title in quotes, author, event, place and dates of the meeting, page range (S).
102. Sharia list, article online or in a newspaper: title, author, outlet, issue if any, date, URL (S).
103. Quran, Sharia list: first line of the Arabic list, no number (S). T instead puts Quranic verses in flower brackets in the body and does not give them a list pattern.
104. Table or figure taken from a source: the source line sits under the table or figure, separate from the list (T). For an APA thesis, T writes that line as (surname, date, page). A figure the writer drew still gets a source note (T).
105. Electronic encyclopedia such as Wikipedia is an internet article (T).
106. Preferred web hosts in T: addresses ending in `edu`, `org`, or `gov`. Other sites are a last resort. A tells the writer to check the credibility of an unsigned page and says APA discourages unsigned pages.
107. Months in an Arabic entry are names, not numbers: كانون الثاني or ك2, never `January` and never `1` (T). English months are written in full (T).
108. A page range uses a dash: `ص- ص: 15-33` (T) or `89–106` (A).
109. Edition in English: `2nd ed.`, `4th ed.` Volume: `Vol.` or `vol.` (T). If there is no edition, no volume, or no issue, that element is left out rather than filled with a placeholder (T).
110. DOI, URL, and "retrieved from" are the closing element when the guide gives one. They do not replace author, year, and title.
111. R's rubric, which is not a format pattern: the written list matches every work used; the list contains Arabic and at least one foreign language; the works are enough, on the topic, recent, and of a good level. Another five marks score obedience to T on layout, numbering, and footnotes.

## T — thesis guide, 2021

### Humanities, law, and arts (T pp. 25–27)

Direct quotation, short (four lines of prose or fewer, or three lines of poetry or fewer): inside `"......"`. Punctuation that belongs to the quotation stays inside the marks; punctuation that belongs to the writer's sentence stays outside. The source is a footnote.

Direct quotation, long: a block of its own, first line new, the whole block indented about 1.27 cm from the right margin, double spaced, no quotation marks. The source is a footnote.

Insertion: `[ ]`. Deletion: `...` then a space.

Paraphrase from one writer: the surname in the text, a short biographical footnote, then another footnote at the end of the borrowed idea with the page. A later use is a full note again. An immediate reuse is `(المرجع السابق، ص: رقم الصفحة)`.

Footnotes are the primary documentation. They also carry short asides, definitions, and pointers to further reading. The call is an Arabic superscript after the sentence, paragraph, or word. Asterisks, angle brackets, and other symbols are not footnote calls. Numbering runs from the first footnote of the thesis to the last. The note sits under a separator rule on the same page: number, space, text, in 10 pt.

The note's source line:

- `الاسم الأخير (سنة النشر)، ص: رقم الصفحة`
- no date: `الاسم الأخير (د ت)، ص: رقم الصفحة`
- no author: `أول كلمتين من العنوان (سنة النشر)، ص: رقم الصفحة`
- same author, same year: letter أ on the title that sorts first, letter ب on the other
- fewer than six authors: every name, commas, و before the last
- more than six: first surname, then وآخرون
- any other shortening is taken from the way the work appears in the list

Proper names, titles, places, institutions, and companies are glossed at their first appearance in the body.

### Engineering and sciences, author–date (T pp. 27–28)

Surname and year in parentheses at the end of the sentence: `(Peck, 2020)`, `(مجاهد وآخرون، 2004)`. A letter splits two works of the same author in the same year: `(Peck, 2020a)`. A quotation, or a citation of a book, adds the page: `(مجاهد وآخرون، 2004، ص: 12)`. The surname can also open the sentence, with the year in parentheses. The list at the end is alphabetical. Each in-text work has one entry there.

### Engineering and sciences, order of citation (T p. 28)

Either `[1]` after the quotation, or a superscript digit. The same work keeps the same number when it returns. T's rejected wordings are `كما ورد في المرجع [1]` and a reversed bracket `]1[`. The list follows first appearance, not language and not type.

### Entry catalogue labelled APA (T pp. 32–38)

T says the guide adopts APA rather than Chicago or MLA, then prints bold-and-underline titles. A later says APA 6 uses italic instead. Both sentences are in the corpus.

Shared tail for books: edition if it is not the first, `المدينة: الدولة`, publisher, `ص: عدد صفحات الكتاب`. Drop the edition element when the book has none.

| Type | Pattern in T |
|---|---|
| Book, one author | العائلة، الاسم. (السنة). **العنوان**. ط: الرقم. المدينة: الدولة. الناشر. ص: العدد. |
| Book, 2–6 authors | Same, cover order, comma and و before the last. English: `&` before the last. |
| Book, 7 or more | First six names, then وآخرون. English `et al.` |
| Translated book | العائلة، الحرف الأول. (السنة). **العنوان**. ترجمة: اسم المترجم غير المعكوس. المدينة: الدولة. الناشر. ص: العدد. |
| Organisation as author | المنظمة. (السنة). **العنوان**. المدينة: الدولة. الناشر. ص: العدد. |
| Chapter with an editor | عائلة كاتب الفصل، الاسم. (السنة). عنوان الفصل. تحرير: اسم المحرر غير المعكوس. **عنوان الكتاب**. ط: الرقم. ص- ص: البداية-النهاية. المدينة: الدولة. الناشر. |
| Chapter, no editor | Same, without the editor element. |
| Signed encyclopedia article | العائلة، الاسم. (السنة). عنوان المقالة. **عنوان الموسوعة**. ج: الجزء. ص- ص: البداية-النهاية. المدينة: الدولة. الناشر. |
| Unsigned encyclopedia article | عنوان المقالة. (السنة). **عنوان الموسوعة**. ج: الجزء. ص- ص: البداية-النهاية. المدينة: الدولة. الناشر. |
| Journal article | العائلة، الاسم. (السنة، اليوم ثم الشهر إن وجدا). عنوان المقالة. **اسم المجلة**. مج: المجلد، عدد: العدد. ص- ص: البداية-النهاية. المدينة: الدولة. الناشر. |
| Newspaper article | العائلة، الاسم. (السنة، اليوم، الشهر). عنوان المقالة. **اسم الصحيفة**. العدد: الرقم. ص- ص: البداية-النهاية. المدينة: الدولة. الناشر. |
| Database article with a print original | Use the journal pattern. |
| Web article | العائلة، الاسم. **عنوان المقالة**. اسم الموقع. تاريخ الاسترجاع. الرابط. T's skeleton omits the year parentheses that the other patterns have. |
| Conference paper | العائلة، الاسم. (تاريخ الانعقاد). **عنوان البحث**. اسم الندوة أو المؤتمر. مكان الانعقاد. |
| Thesis | العائلة، الاسم. (السنة). **عنوان الرسالة**. الدرجة. الشعبة. القسم. الكلية. الجامعة. المدينة: الدولة. ص: العدد. |
| Artwork | العائلة، الاسم. (التاريخ). **عنوان الإنتاج**. نوع الإنتاج. المدينة: الدولة. مكان وجود العمل. |
| Recorded speech or interview | العائلة، الاسم. (السنة والشهر واليوم). **عنوان الموضوع**. معلومات توضيحية. اسم المنسق. المدينة: الدولة. مكان الأرشفة. |

Worked book example, restored only by joining lines the PDF had split:

> الجابري، محمد عابد. (2001). **العقل الأخلاقي العربي**. ط: 2، بيروت: لبنان. مركز دراسات الوحدة العربية. ص: 317.

Missing pieces (T p. 38): `(د. ن.)` when the publisher is unknown, `(د.ت.)` / `n.d.` when the year is unknown, no edition token when there is no edition, no volume token when there is no volume. No author: start with the title, then the year, then the rest. No دكتور or مهندس. Arabic compound names keep every given name after the family name. Latin names shrink to initials. Cover order is kept, because it records contribution or rank. More than six authors: six names, then وآخرون / `et al.` Page ranges use a dash. Arabic months are words (`كانون الثاني` or `ك2`); English months are full words.

T p. 39 also says a master's thesis should not lean on diploma essays, a doctorate should not lean on master's theses, schoolbooks are only acceptable when they are themselves the case under study, and web sources should be `edu`, `org`, or `gov`, with Wikipedia filed as a web article.

### How T builds the list (T pp. 39–40)

Three numbered sections:

1. Arabic. Subheadings for books, encyclopedias and dictionaries, theses, conferences and workshops and research studies, periodicals, documents, maps, and pictures, and for any further type that contains more than three entries. Alphabetical by family name, ال ignored. Same author by year, oldest first. Same year by the first letter of the title.
2. Foreign, with the same classification and the same sort.
3. Websites: author, and the URL, using the same entry rules.

The numbered engineering style replaces all of that with citation order.

### List position and English spacing (T pp. 43, 46)

Order of the back matter in the contents list: body, المراجع, ملاحق, English abstract, English title page. English reference entries are single-spaced, with a one-and-a-half-line gap between entries. English body text is one and a half. Footnotes in an Arabic thesis are 11 pt Simplified Arabic in that typesetting section; the footnote chapter itself says 10 pt.

A table's source line is under the table. If the writer made the table, the line says so (`المصدر: المكتب المركزي للإحصاء، المجموعة الإحصائية 2013`). If the thesis uses APA, the line is `(كنية المؤلف، تاريخ، صفحة)`. A borrowed figure, and a figure the writer drew, both get a note under the figure.

## A — APA 6 guide, Faculty of Education

A is explicit that its examples follow the sixth edition of the APA manual, with Arabic examples added.

### Quotation, theft, and italics (A pp. 7–9)

A quotation in the writer's own words still carries the author's family name, the year, and the page when the wording is a quotation or a close paraphrase. A block that is not indented as a quotation is treated as plagiarism. Italic, not bold and not underline, for a book title, a journal name, and a thesis title. Article titles take as little capitalisation as possible; journal names take as much as possible.

Forty words or fewer stay inside quotation marks. Above forty words: indent 1.27 cm from the right margin (the same indent as a first line), tighter line spacing, the body font, and the citation after the last period. A copied grammatical error is followed by `sic` in brackets. A web page with no page numbers is cited by paragraph, abbreviated `para.`

### References versus sources, and the shape of the list (A pp. 10, 26–27)

قائمة المراجع contains every work cited in the body. قائمة المصادر contains works the writer depended on but did not cite. The upload check the user described is the first of those.

The list:

- starts on its own page in a thesis, and as its own part in an article
- heading قائمة المراجع / References, centred
- Arabic entries, then foreign entries
- first line at the margin, following lines indented five spaces
- double line spacing, no empty paragraph between entries
- alphabetical, the order Word produces
- not divided into books, journals, and other groups
- the family name is the sort key, and it is the same form used in the body
- a work with no author is entered and cited under its title
- an Arabic entry follows the same element order as a foreign entry

A journal article's list elements, in order: family name, initials, year in parentheses, article title, italic journal name, italic volume, issue in regular parentheses, page range. A DOI is added as a link when the journal has one.

Appendices follow the list, each on a new page, numbered ملحق (1) and titled.

### In-text author count (A pp. 10, 13–14)

Read this next to the matrix. The pages do not say one rule.

- One or two authors: both names on every mention.
- Two to six authors, p. 10: every name the first time; after that, the first author and وآخرون or `et al.`
- More than six, p. 14: `et al.` / وآخرون from the first mention.
- The p. 13 table also has a row "more than 7" with `et al.` from the first mention, which leaves 7 described both ways.

Inside a sentence A writes `and`. Inside a parenthesis and in the list A writes `&`.

### List author count (A pp. 11–12, 14, 18)

- Up to the sixth or seventh author, A says to keep naming them.
- Eight or more, p. 12: the first seven, a comma, three dots, the last author.
- p. 18: one to seven, every name; more than eight, the first six, three dots, the last author.

### Cases with a list consequence (A pp. 14–24)

| Case | In the text | In the list |
|---|---|---|
| Two books, one author | years oldest first | single-author entry before the co-authored entry |
| Same authors, same year | `2006a`, `2006b` | both entries, ordered by title |
| Same surname, different people | initial in the citation | two entries, `Smith, J.` and `Smith, R.` |
| Chapter | author and year | chapter author, year, chapter title, `In` editor `(Ed.)`, italic book, edition, chapter pages, place: publisher |
| No date | `(د.ت)` / `(n.d.)` | `(n.d.)` in the year slot |
| Translation | author of the original work | translator's name in normal order, `(مترجم)` or `(Trans.)`. English sample adds `(Original work published in 2006)` |
| Secondary | `as cited in` the book in hand | only the book in hand |
| Two works through one book | both primary names, `as cited in` the book in hand | only the book in hand |
| Ebook | author and year; page if the file has one | `[Kindle Edition]` or the reader name, `Retrieved from` the URL |
| No author and no date, ebook | shortened italic title `(n.d.)` | italic title, `(n.d.)`, URL, sorted by the title |
| Republished online | `1921/2007` | list year is the online year; original year in a closing parenthesis |
| Journal | author, year, page | author, year, article title, italic journal, italic volume, issue, pages |
| Journal with DOI | author, year | DOI at the end |
| Journal without DOI | author, year | `Retrieved from` the journal URL |
| Database record | author, year | journal pattern, then retrieval date and the database name. A separate note says the printed URL should be the publisher's |
| No volume and no issue | author, year, page | year and month, or a season, occupy the volume slot |
| In press | `(in press)` | no volume, issue, or pages |
| No author, article | short title in quotes, year | full title, then year |
| Report, 4–5 authors | all names, then `et al.` | all names, report number in brackets, place: institution |
| Report, author is not the publisher | organisation or person, year | `Retrieved from` the URL |
| Report, author is the publisher | organisation, year | URL, no extra publisher line |
| Same organisation, same year, several reports | `2000a` in later mentions; first mention can carry the full name | one entry per letter |
| Long government URL | the site's root may replace the full path | — |
| Conference proceedings | author, year, page | paper title, `In` the proceedings title, pages, place: organiser. Publication year wins if it differs from the meeting year |
| Unpublished paper | author, year | `(Month year). Paper presented at …, city` |
| Web page | author, year | `Retrieved from` URL. Not underlined. Retrieval date not required |
| Web page, no date | organisation `(n.d.)` | `(n.d.)` and the URL |
| Web page, no author | short title, year | title, year, URL. A discourages unsigned pages |
| Original and online republication of a letter | `1859/2011` | online year in the year slot, original year at the end |
| Audio or video | producer or author, year | date, title, `[Audio file]` or `[Video file]` or `[Episode n]`, series, URL |
| YouTube, no author | title can stand as the author | title, `[Video file]`, URL. The uploader is omitted unless they are an author or producer |
| Blog | author, year | full date, title, `[Web log post]`, retrieval date, URL |
| Brochure, pamphlet | organisation, year | title, `[Brochure]` or `[Pamphlet]`, place: publisher or `Author` |
| Newspaper online | author, year | date, italic newspaper, `Retrieved from` the newspaper's URL rather than a deep link that may die |
| Newspaper, no author | short title, year | full title, date, newspaper, page |
| Facebook, Twitter | account or short title, year, letter if needed | post date, `[Group page]` or `[Twitter post]`, URL |
| Edited encyclopedia | editor, year | `(Ed.)`, italic title, edition, volumes, place: publisher |
| Signed encyclopedia article | author, year | `In` the encyclopedia, volume, pages |

A p. 25 adds writing advice that touches the check only at one point: do not put a borrowed sentence, figure, or result in the file without a citation, and do not cite a secondary source when the primary is what should have been read. The title of a thesis is at most 15 words, and the title page follows the university thesis guide rather than the APA title page.

## P — Purdue slides

P is a teaching deck. Its reference-list samples are shorter than A and use place and publisher, which is the sixth edition's book pattern.

Why the list exists (P pp. 2–10): a reader can find the work; every retrievable cited work is on the list; every list entry is cited. P mentions EndNote as the way to keep that pairing.

Book (P p. 12): `كنية المؤلف، مختصر الاسم الأول. (التاريخ). عنوان الكتاب مائل. مكان النشر: دار النشر.` The Arabic sample is:

> سلوم، طاهر. (2005). المرجع في التربية البيئية والتربية السكانية. دمشق: منشورات جامعة دمشق.

Journal and magazine (P p. 13): the article title is not italic; the journal is. The Arabic magazine sample puts the month inside the year parentheses and gives a page range with no volume:

> سلوم، طاهر. (2005، كانون الأول). السكان والبيئة. مجلة المعرفة. 15-40.

Web page (P p. 14): year and day and month, italic title, site, then `مراجعة 20 أيار 2009 من` the URL. The English twin uses `Retrieved October 28, 1998 from`.

Conference (P p. 14): the proceedings title is italic. The Arabic sample records the meeting's dates in the entry and ends with `بكين / الصين`. A note on the slide: if the publication date and the delivery date differ, the publication date is the one in the year slot.

Newspaper (P p. 15): calendar date, and `ص.` or `p.` before the page. No author: the title moves to the author slot, and the date stays in parentheses.

P p. 16 tells the writer not to guess an odd source type.

In text (P pp. 17–24):

- Quote, summary, and paraphrase all get a citation.
- The citation is before the quotation or after it, not both.
- Narrative: `Caruth (1996) … (p.11)` and `السيد (2017) … (ص3)`.
- Parenthetical: `(Caruth, 1996, p.11)` and `(بشارة والياس، 2014، ص438)`.
- Same surname: `(H. James, 1878); (W. James, 1880)`.
- Several works: semicolons inside one pair of parentheses.
- Six or more authors: `(Smith et al, 1998)`.
- A part of a work: `(Jones, 1995, chap. 2)`.
- No author: a short title, `("California," 1999)`.
- Personal communication has an in-text pattern and no list pattern in the deck.
- A URL can be the citation by itself.
- A secondary citation names the work in hand (`ورد في`, `as cited in`).

P also says the title page follows the Damascus University guide, and the title is at most 15 words.

## S — Sharia college, 2022

S applies to كلية الشريعة. It is a footnote system with a title-first list. It is not the APA list in T or A.

### Quotation (S p. 36)

A short quotation is inside `«...»`. More than forty words: a block indented five characters from both margins, no quotation marks, ending with a period. The wording, spelling, and punctuation are copied. An addition is in `[ ]`. An error is copied and followed by `[هكذا]`. A deletion is `...` and a space. Emphasis is an underline and `(التأكيد من قبل الباحث)`. The footnote number is a superscript in parentheses at the end of the quotation, or at the end of the author's name if the name opens the quotation.

### What a footnote is for (S pp. 37–38)

The note at the foot of the page carries hadith takhrij, the source of a quotation, a gloss, a biography, a cross-reference, a comment, a variant reading, and pointers to further reading. Hadith are documented by the rules of the field, and the introduction of the thesis says which rules. A scholar's words are taken from that scholar's own book when one exists; otherwise from the nearest book of the same school or period. A school position is taken from the school's relied-upon books, older ones first when several are cited. A technical term is taken from a dictionary or a specialist glossary.

Biographical notes stay within about three lines: the name, birth and death in parentheses, the second name and the title, places, the field, the distinctive merit, the main printed works. The biographical source matches the person's field.

One footnote may cite several works. The thesis picks one order and declares it in the introduction:

- the work that treats the point most fully comes first
- or the author who died earlier comes first
- or the older school comes first (Hanafi before Shafi'i in S's example)
- or the specialist book comes first (usul before fiqh or language, when the point is usul)

### Footnote mechanics (S p. 38)

Notes sit at the foot of the page, one line apart. Each page starts at 1. The call in the body is a superscript Arabic numeral in parentheses, immediately after the information. The number in the note is in larger parentheses, at the note's font size. Wrapped lines indent 0.6 cm toward the left in Arabic and toward the right in English. S refers to a model for that indent; the model pages are forms, not extra rules.

### Footnote patterns (S pp. 38–42)

| Type | Order | Repeat on the same page |
|---|---|---|
| Dictionary | عنوان المصدر، اسم الشهرة، (الجزء/الصفحة)، مادة (المدخل) | `المصدر نفسه` plus the new location and entry |
| Classical Sharia book | عنوان المصدر، اسم الشهرة، (الجزء/الصفحة) | `المصدر نفسه` |
| Manuscript | العنوان، اسم الشهرة، (رقم اللوحة/رمز الوجه)، مخطوط | — |
| Hadith collection | العنوان ثم اسم الشهرة، كتاب وباب الحديث، (الجزء/الصفحة)، (رقم الحديث إن رُقّم) | — |
| Modern book, 1 author | العنوان، اسم المؤلف، (ص الصفحة) أو (الجزء/الصفحة) | `المرجع نفسه` |
| Modern book, 2 or 3 authors | العنوان، الأسماء بترتيب الغلاف، (الصفحة) | `المرجع نفسه` |
| Modern book, more than 3 | العنوان، أول اسم على الغلاف وآخرون، (الجزء/الصفحة) | `المرجع نفسه` |
| Thesis | العنوان كاملاً، الباحث، (رسالة ماجستير/أطروحة دكتوراه)، (ص الصفحات) | — |
| Journal article | «العنوان»، الباحث، اسم المجلة، (الصفحات) | title, author, and pages; the journal name drops |
| Journal article, several authors | «العنوان»، الأسماء بترتيب العنوان، المجلة، (الصفحات) | — |
| Conference | «العنوان»، الباحث، اسم المؤتمر، (الصفحات) | — |
| Magazine, newspaper, or website | العنوان، الكاتب، اسم الوعاء، (تاريخ الزيارة أو الاسترجاع) | — |
| Interview | موضوع الحوار، المحاوِر، المحاوَر، اليوم والشهر والسنة | — |
| Statute | article and paragraph stay in the body | اسم القانون، نسبته إلى بلده، رقمه وسنته |

Restored examples:

> لسان العرب، ابن منظور (8/183)، مادة (شفع)
> المصدر نفسه (4/264)، مادة (لقط)
> الإتقان في علوم القرآن، السيوطي (5/1840)
> مجمع البيوع، العيني (ق71/أ) مخطوط
> صحيح البخاري: كتاب النكاح، باب المرأة راعية في بيت زوجها، (5/1996)، (4904)
> الوجيز في أصول الفقه، وهبة الزحيلي (ص119)
> الإيضاح في علوم الحديث، مصطفى الخن وبديع السيد اللحام (ص78)
> نزهة المتقين شرح رياض الصالحين، مصطفى الخن وآخرون (1/180-190)
> «أسس التعايش في الإسلام»، نصار نصار، مجلة جامعة دمشق للعلوم الاقتصادية والقانونية (ص231-232)
> قانون الأحوال الشخصية السوري، القانون رقم (59) لعام (1953م)

The manuscript and dictionary examples are the ones whose digits were least stable in the extract.

### The list (S pp. 21, 43–44)

The list comes after the appendices and before the English abstract. It contains the works that the footnotes cite. A separate sheet, with no page number, is titled المصادر والمراجع and placed in front of it. Arabic works, then foreign works. Alphabetical, and the sort ignores ال, ابن, and أب/أبو. The book title starts at the margin; a wrapped line indents 0.8 cm. Nothing is listed that was not mentioned in the body. The Quran is the first Arabic entry and receives no number.

| Type | List pattern |
|---|---|
| Book | العنوان، المؤلف أو المؤلفون، المحقق، مكان النشر: دار النشر، رقم الطبعة، تاريخ الطبع، عدد الأجزاء أو الصفحات |
| Edited chapter | عنوان الفصل، مؤلف الفصل، (صفحات الفصل)، ضمن: عنوان الكتاب، المحرر (محرر)، مكان النشر: دار النشر، الطبعة، التاريخ، الحجم |
| Thesis | العنوان، الباحث، نوع البحث، الجامعة: الكلية: القسم، التاريخ، البلد، الأجزاء أو الصفحات |
| Periodical | «العنوان»، الباحث، المجلة، ترقيم العدد والتاريخ كما طُبعا، البلد، (صفحات البحث) |
| Conference | «العنوان»، الباحث، اسم المؤتمر، مكانه ومدته، (صفحات البحث) |
| Article, print or web | العنوان، الكاتب، المجلة أو الصحيفة أو الموقع، رقم العدد إن وجد، التاريخ، الرابط |
| Manuscript | العنوان، المؤلف، مكان الحفظ، رقم الإيداع، عدد الأوراق |

S does not say to italicise, to invert names, or to put the year in parentheses. The title leads.

## R — registration and defence procedures, 2022

R p. 6 points formatting questions to the thesis-writing guide on the directorate's site (T). R does not define an entry.

The written-thesis mark inside the 45-point written score includes two items that touch this feature (R p. 19), five points each:

- Following the adopted thesis guide: layout, numbering, footnotes, consistent terminology.
- Scientific documentation and the writer's honesty: the reference list written in the index matches every work used; the list includes Arabic works and foreign works in any foreign language; the works are sufficient, relevant, recent, and of a good level.

"في الفهرس" is R's wording. It can mean the list as it appears in the table of contents, or the list itself. The sentence requires a match between that written list and the works the thesis used.

## What these PDFs contain that is not a reference-list rule

Left out of the scenario index on purpose:

- R's whole procedure for registration, committee membership, the public defence, and the degree (32 pages).
- T's chapters on topic choice, proposal sections, plagiarism as a conduct rule, page setup (A4, 2.54 cm, Simplified Arabic 13 pt, line spacing 1.5), binding colour, and the general theory of tables and figures, except the source line under a table or figure.
- A's advice on reading, On sample wording, and on how to structure an introduction, method, results, and discussion, except the rule that every borrowed item carries a citation.
- P's slides on why students use APA.
- S's chapters on the research proposal, administrative steps, and prose style, except the documentation chapter and the back-matter rules for المصادر والمراجع.
