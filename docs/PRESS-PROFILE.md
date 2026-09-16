# Press profile — what Damascus University has supplied

The authoritative record of the institutional facts Folio is configured from:
identity, domain, ISSNs, approved policy text, roles, and operational
commitments. Supplied by the university on **2026-09-12**; its answers to the
follow-up list arrived on **2026-09-14** and are marked with that date.

Two things this file is careful about:

- **Supplied is not the same as verified.** A value marked *proposed* is
  something the university suggested but has not yet created or confirmed (a
  mailbox that does not exist yet, an address nobody has tested). Those must not
  be configured as if they were real.
- **Nothing here is invented.** Where the university left a field blank, this
  file says blank and the corresponding column stays NULL. Open gaps live in
  [`EXTERNAL-ACTIONS.md`](./EXTERNAL-ACTIONS.md).

---

## 1. Identity

| Field | Value |
|-------|-------|
| Publisher | جامعة دمشق / Damascus University |
| Press contact (Primary Contact) | `journals.dpt@damascusuniversity.edu.sy` — the head of the journals section, Directorate of Scientific Research |
| Technical / indexing contact | `ojs.admin@damascusuniversity.edu.sy` — **proposed, not yet created** |
| Postal address (Crossref requirement) | البرامكة، دمشق، الجمهورية العربية السورية — Al-Baramkeh, Damascus, Syrian Arab Republic |
| Issuing body | نيابة جامعة دمشق لشؤون البحث العلمي والدراسات العليا |

**Aims and scope (press-wide).** نشر البحوث والدراسات الأكاديمية الأصيلة
والمبتكرة والمحكّمة لأعضاء الهيئة التدريسية والباحثين من داخل وخارج الجامعة
باللغتين العربية والإنجليزية.

*Publication of original, innovative, peer-reviewed academic research by faculty
and researchers from inside and outside the university, in Arabic and English.*

This is the **press-level** scope. Each journal's own aims and scope
(`journals.description_ar` / `description_en`) is **written in the app** by that
journal's editor-in-chief or the journal manager (decided 2026-09-14, because
editors-in-chief change every year). See section 3.

**Logo rule.** The official Damascus University logo is the single umbrella
mark; the individual series name is written **beneath** it in the frontend
navbar. One mark, nine titles — not nine logos. **The file itself** (SVG plus a
square PNG) is promised by the university but **not yet received** (G5).

**Editorial data.** Peer review is سري ومحكّم (double-anonymous, section 5
below). Languages accepted: Arabic or English, each article carrying an abstract
in both. Frequency: quarterly, about 4 issues per journal per year. Access:
fully open, every article free as PDF.

---

## 2. Domain and hosting

| Field | Value |
|-------|-------|
| Production domain | `https://journal.damascusuniversity.edu.sy` |
| DNS and TLS | administered by the DU ICT centre (مركز تقانة المعلومات والاتصالات) |

**Configured as** `PUBLIC_SITE_URL` in *both* `backend/.env` and
`frontend/.env.local`. The value is documented in both `.env.example` files and
must be set **before the first OAI harvest** — record identifiers are
`oai:<domain>:<slug>` and permanent.

Server, deployment owner and certificate issuer are still open (G11, deferred by
the university on 2026-09-14).

---

## 3. The nine journals

**Which nine (settled 2026-09-14).** The nine are Folio's nine. مجلة التخطيط
المستدام (Sustainable Planning, e-ISSN 3079-6083), which appeared in the
university's ISSN table, is **dropped** and will not be added. مجلة الدراسات
التاريخية (`hisj`), which the table left out, **stays**. Slugs are unchanged.

**Who maintains what (decided 2026-09-14).** Journal metadata is edited in the
app at *Journal details* (`/journal-manager/journals`), not in code:

| Field | Edited by |
|-------|-----------|
| Registered titles, Arabic and English | the journal manager only |
| ISSN and e-ISSN | the journal manager, or that journal's editor-in-chief |
| Aims and scope, Arabic and English | the journal manager, or that journal's editor-in-chief |

The database is the source of truth from then on. `JOURNAL_CATALOG` holds only
the values the rows were first created with, and migration
`JournalIssns1783600000000` fills the numbers below into columns that are still
empty and never overwrites one staff have entered. ISSNs are checked for a valid
check digit on save; all ten numbers below pass.

**ISSNs as supplied on 2026-09-12** (initial values):

| Slug | Journal | ISSN (print) | e-ISSN |
|------|---------|--------------|--------|
| `artsj` | مجلة الآداب والعلوم الإنسانية | 1818-5010 | 2789-6552 |
| `hisj` | مجلة الدراسات التاريخية | not supplied | not supplied |
| `basj` | مجلة العلوم الأساسية | 1726-5487 | 2789-6366 |
| `econj` | مجلة العلوم الاقتصادية والسياسية | none exists | 2789-8202 |
| `eduj` | مجلة العلوم التربوية والنفسية | not supplied | not supplied |
| `agrj` | مجلة العلوم الزراعية | not supplied | not supplied |
| `medj` | مجلة العلوم الطبية (والصحية) | 2072-2265 | 2789-6889 |
| `lawj` | مجلة العلوم القانونية | none exists | 2789-7621 |
| `engj` | مجلة العلوم الهندسية | 1999-7302 | 2789-6854 |

"none exists" is the university stating غير متوفر حالياً. "not supplied" is the
university's table not reporting the journal, or reporting only
"متوفرة إلكترونياً" with no number printed. Those numbers are now entered in the
app when they arrive (G2).

`medj`'s exact registered title (العلوم الطبية or العلوم الطبية والصحية) is
likewise a change the journal manager makes in the app once confirmed.

---

## 4. DOI / Crossref

**Position stated by the university.** International banking restrictions make
the Crossref membership fee (about USD 275 per year) and the per-DOI fee (about
USD 1) not payable from Syria at present.

**Existing prefix: none (2026-09-14).** The university does not currently hold a
DOI prefix through the library or any other route, so there is no free path via
an existing membership.

**Directive to the developer.** Build the DOI path and keep it active in code,
but do **not** wire it to a live payment or deposit gateway. Keep a prefix field
(`10.xxxxx`) prepared in the database so it can be connected the moment an
external payment channel or a third-party academic sponsor appears.

**Current code status: not built.** The only `doi` fields in the codebase belong
to *reference list entries inside a manuscript* — there is no publisher-side DOI
minting, no prefix column, no deposit XML. See gap G6.

---

## 5. Approved policies

Approved by the university on 2026-09-12. These are **institutional
commitments**, not drafts.

| Policy | Commitment |
|--------|-----------|
| Open-access licence | **CC BY-NC** (نسب المصنف — غير تجاري). Content fully free. Applies to new articles *and* the entire back catalogue |
| Peer review | **Double-anonymous** (التحكيم السري المزدوج المعمى) — author and reviewer identities removed throughout. The review copy must carry no author name or identifying hint |
| Publication ethics | Follows **COPE** guidelines |
| Plagiarism | A similarity report (Turnitin, PlagScan or equivalent) is **required at submission**; quotation must not exceed **20%** |
| Archiving and preservation | **No paid external preservation** (no CLOCKSS, no Portico). Local university server backups only — this must be stated honestly on the site, because DOAJ asks the question directly |
| Author charges (APCs) | **None** for faculty and postgraduate students under internal university agreements. Any local nominal fee must be published explicitly. The exact sentence, including external authors, is to be supplied later (G12) |
| Copyright | Publication and quotation rights vest in the journal and Damascus University; the author retains the **moral rights** to their work |

Other rules required at submission: the work must be unpublished and not under
consideration elsewhere; abstracts in both Arabic and English of **100–200
words** followed by keywords; citation style per journal (APA, or Chicago for
the humanities titles).

**Configured as** `OAI_RIGHTS_STATEMENT` (CC BY-NC), now set in
`backend/.env.example` and emitted as `dc:rights` to every harvester. The
public-facing policy **pages do not exist yet**, and the university has asked to
leave them as they are for now (G4, 2026-09-14).

---

## 6. Roles and accounts

| Role | Assignment |
|------|-----------|
| Primary Contact | Head of the journals section, Directorate of Scientific Research — `journals.dpt@damascusuniversity.edu.sy` |
| Journal Manager (system administrator) | The DU Informatics Directorate (مديرية المعلوماتية) |
| Section Editors | **Two administrative staff per journal**, 18 accounts in total, named per journal (`eng.editor@…`, `med.editor@…`) so journal scopes stay fully separated |

Section editors screen submissions **formally** before they reach reviewers.

**Editors-in-chief and editors are entered by the university in the app
(2026-09-14).** Editors-in-chief change every year, so nobody supplies a list for
the developer to load. The journal manager invites the person as *editor*, and
once they accept, sets **Editor-in-chief of** on the users screen. That one
setting gives them their journal's submission queue and lets them edit its ISSNs
and aims and scope. Section editors are placed the same way with their own
journal setting.

Supplied on 2026-09-12 for reference (3 of 9); the accounts themselves are
created by the university:

| Journal | Name | Email |
|---------|------|-------|
| `basj` العلوم الأساسية | أ.د. كمال كايد | `kamal.kayed2@damascusuniversity.edu.sy` |
| `agrj` العلوم الزراعية | أ.د. محمد محمد | `mohamad-m51@damascusuniversity.edu.sy` |
| `eduj` العلوم التربوية | أ.د. رمضان محمد درويش | `Ramadan.darwish@damascusuniversity.edu.sy` |

**The published editorial board** is kept apart from accounts, because most
board members never log in. The journal manager or the journal's
editor-in-chief enters each member (name in Arabic and/or English,
affiliation, role, ORCID iD) at *Journal details → Editorial board*, and the
board is published at `/journals/<slug>/editorial-board`. ORCID is required
for every board member, in line with the rule below.

**ORCID (decided 2026-09-14).** ORCID is **the primary identifier of every
participant** in the journal: authors, reviewers, editors, staff. What that
means in the system:

- Registration with email and password **requires** an ORCID iD, and the check
  digit is validated. Signing up through ORCID supplies the iD automatically.
- An account without an iD (created before the rule) is held at
  `/complete-profile` until it adds one, by typing it or linking through ORCID.
- An iD can be corrected but never removed. Unlinking ORCID sign-in removes the
  sign-in link and keeps the iD on the profile.
- The `users.orcid` column stays nullable at the database level, because rows
  created before the rule may lack one. The rule is enforced where accounts are
  created and at sign-in.

---

## 7. Operations

**Secrets** (`C3` in EXTERNAL-ACTIONS). Following the security fix of
**2026-09-08**, every old or unencrypted credential is to be wiped and fresh
production keys generated: `JWT_SECRET` (32+ chars, random), `DB_PASSWORD`
(stored outside any git repository), and new production API keys for Typesense,
mail and the AI service. `validate-runtime-config.ts` already refuses to boot
production on placeholder values.

**SMTP.** Outbound mail goes through the Damascus University mail server over
the secure port with documented Host / Port / TLS settings, so review and
registration notices are not classified as spam. **The actual values have not
been supplied** and the university has deferred them (G9, 2026-09-14).

**Backup and disaster recovery** (`C1` and `C2`, previously unanswered, now
answered):

| Commitment | Value |
|-----------|-------|
| Frequency | Full backup **daily at 02:00** (database plus uploaded PDFs) |
| Destination | University servers locally, plus a **weekly encrypted copy** to a physically separate off-site server |
| Retention | **90 days** |
| RPO | **24 hours** maximum (at most one working day lost) |
| RTO | **under 4 hours** to full service after a total failure |
| Drill | A **mock recovery test** on a local server is required before launch, timed and documented — the measured duration is the real RTO |

---

## 8. Back catalogue

- **Scope.** Every issue of every Damascus University journal from **2010 to the
  present** is to be imported and made fully available.
- **Licence.** CC BY-NC, the same as new content.
- **Broken text layers.** 48% of the PDFs have unusable text layers. Decision
  taken: **run OCR** (about 25 hours of work) and repair the text layer before
  upload, rather than importing the files as they are — DOAJ and search crawlers
  must be able to read inside the PDF, so importing broken files would damage
  indexing.
- **Logistics** (where the files live, issue and volume mapping, who supplies
  article metadata) are still open and deferred (G10, 2026-09-14).

---

## 9. Gaps

Items still missing are tracked as **G1–G12** in
[`EXTERNAL-ACTIONS.md`](./EXTERNAL-ACTIONS.md), section "Still missing", with
the status each reached on 2026-09-14.
