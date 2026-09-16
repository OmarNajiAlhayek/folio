# External actions — things only you can do

Folio's remaining gaps split cleanly in two: work that can be done in this
repository, and work that needs a registration, a fee, a domain, a credential or
an institutional decision. This file tracks the second kind.

**Working policy.** Everything that can be built is built, behind a config flag
where it needs a credential, so the code is finished and inert until the item
below is done. Nothing here is a reason to leave code half-written, and nothing
here is faked with a placeholder — no invented DOIs, no example ISSNs, no policy
text presented as approved.

**Status key** — `open` nobody has started · `in progress` · `done` ·
`blocked` waiting on another row.

**Damascus University answered a large part of this on 2026-09-12.** Everything
it supplied is recorded in [`PRESS-PROFILE.md`](./PRESS-PROFILE.md): identity,
domain, ISSNs, approved policy text, roles, backup commitments. The rows below
carry the resulting statuses. What is *still* missing is listed as **G1 to G12**
under [Still missing](#still-missing).

**It answered that follow-up list on 2026-09-14.** Three answers changed code,
not just paperwork: journal titles, ISSNs and aims and scope are now edited in
the app (titles by the journal manager only); the journal manager places each
editor-in-chief in their journal on the users screen; and every account must
have an ORCID iD. Where each G-item now stands is in the
[Still missing](#still-missing) table.

---

## A. Scholarly indexing

Without these, published articles cannot enter the scholarly record. This is the
gap between "a working peer-review system" and "a journal".

| # | Action | Status | Blocks | Code waiting? |
|---|--------|--------|--------|---------------|
| A1 | Obtain an **ISSN** for each of the nine journals | **partly done 2026-09-12** - 6 of 9 numbered; the rest are entered in the app, see G2 | A5, A6, credibility in Scholar | **Yes — finished.** Staff edit them at *Journal details* (check digit validated); portal, `citation_issn` and Dublin Core emit a number when set and omit the field cleanly when not |
| A2 | **Crossref** membership + DOI prefix | open - no existing prefix (2026-09-14), fees not payable from Syria | DOI minting, Crossref deposit | Not yet built |
| A3 | Public **domain + HTTPS hosting** | **domain fixed 2026-09-12**, not deployed - see G11 | A4, A5, A6, A7 — everything crawler-facing | **Yes — finished.** Set `PUBLIC_SITE_URL` in both services (see below) |
| A4 | **Google Search Console** verification, submit sitemap | blocked by A3 | Google indexing | **Yes — finished.** `sitemap.xml` + `robots.txt` built and verified |
| A5 | **Google Scholar** inclusion request | blocked by A1, A3 | Scholar indexing | **Yes — finished.** `citation_*` tags verified in server-returned HTML |
| A6 | **DOAJ** application | blocked by A1, B1–B5 | Directory listing, credibility | Partly — OAI-PMH is built; the policy pages (B1–B5) are not |
| A7 | Register OAI base URL with **BASE / OpenAIRE** | blocked by A3 | Aggregator harvesting | **Yes — finished.** OAI-PMH 2.0 served at `<site>/api/v1/oai` |

### Set these two values first (they unblock A4, A5 and A7 at once)

Everything crawler-facing is inert until the public origin is known, and it is
deliberately the same variable name in both services:

| Where | Variable | Value |
|-------|----------|-------|
| `backend/.env` | `PUBLIC_SITE_URL` | the public origin, no trailing slash |
| `backend/.env` | `OAI_ADMIN_EMAIL` | a real, monitored contact address |
| `frontend/.env.local` | `PUBLIC_SITE_URL` | the same origin |

Until `PUBLIC_SITE_URL` is set, `robots.txt` disallows everything and
`sitemap.xml` is empty — so a staging box never gets indexed by accident. Until
both backend values are set, the OAI endpoint answers 503 and names what is
missing.

**Set `PUBLIC_SITE_URL` to the final domain before the first harvest.** OAI
record identifiers are `oai:<domain>:<slug>` and are permanent; changing the
domain later makes every aggregator treat the archive as a brand-new set of
records and orphan everything it already indexed.

### A1 — ISSN (start here)

An ISSN is an 8-digit code identifying a journal **title** across every issue it
will ever publish — ISBN identifies a book, DOI identifies one article, ISSN
identifies the journal itself. It is per journal, so nine are needed, not one
for the university. Print and electronic editions get **separate** numbers
(ISSN and e-ISSN). It is free.

It matters because DOAJ will not accept an application without one, and because
it is the field that tells Google Scholar which journal an article belongs to.

**Where to find them, in order of least effort:**

1. **The existing DU OJS site** —
   <https://journal.damascusuniversity.edu.sy/index.php/index/ar> — journal
   home pages normally print the ISSN directly.
2. **The cover or masthead of any recent printed issue.** The nine series are
   long-running print journals and very likely already hold print ISSNs.
3. **The university library's periodicals desk**, for anything still missing.

Only apply for new numbers where the *electronic* edition lacks one; those go
through the Syrian national ISSN centre (the ISSN International Centre lists
national centres).

**Landed 2026-09-12.** The university's official ISSN table supplied six of the
nine journals. They were seeded through `JOURNAL_CATALOG` and filled into
existing databases by migration `JournalIssns1783600000000`; the full table is in
[`PRESS-PROFILE.md`](./PRESS-PROFILE.md).

**Maintained in the app since 2026-09-14.** ISSNs are edited at *Journal details*
by the journal manager or that journal's own editor-in-chief, and the check
digit is validated on save. The remaining numbers (**G2**) are entered there
when they arrive, not in code: `hisj`, `eduj` and `agrj` carry none yet. `econj`
and `lawj` report no print ISSN, and that is an answer rather than a gap: they
are electronic-only.

*Code status: done for what was supplied.* The journal page, the `citation_issn`
meta tag and the Dublin Core `dc:source` element each render the number when
present and omit the field entirely when null, so a journal without one
publishes no ISSN rather than a placeholder.

### A2 — Crossref / DOI

A DOI is what makes an article permanently citable and resolvable. Crossref
membership carries an **annual fee** (tiered by publisher revenue; small
publishers start around USD 275/year) plus a per-DOI deposit fee, and requires a
signed membership agreement.

Two things to check before applying:

1. **Does Damascus University already hold a Crossref prefix?** Universities
   often have one through the library or another faculty; publishing under an
   existing prefix avoids a second membership entirely.
2. **Payment routing.** International payments from Syria may be constrained.
   Establish that the fee can actually be paid before designing around DOIs —
   if it cannot, the honest fallback is a persistent internal identifier plus a
   stable URL, and I should build that instead.

**Answered 2026-09-12, and the answer is a constraint.** The university states
that international banking restrictions make the Crossref membership fee and the
per-DOI fee not payable from Syria at present. Its directive: build the DOI path
and keep the module active in code, but do not wire it to a live payment or
deposit gateway, and keep a prefix field (`10.xxxxx`) prepared in the database so
it can be connected the moment an external payment channel or a third-party
academic sponsor appears.

That is this file's working policy applied to DOIs, so it is accepted as-is. Two
things follow:

1. **An existing prefix was the free route, and there is none (G6, answered
   2026-09-14).** The university holds no DOI prefix through the library or any
   other route, so minting waits for a payment channel or a sponsor.
2. **The code does not exist yet.** "Keep the module active" describes something
   Folio has never had. The build is listed under
   [Still missing](#still-missing); it needs no prefix to be written and stays
   inert until one is supplied.

Until a DOI can actually be minted, the honest public identifier is the article's
stable URL under the fixed domain, which is already what `citation_pdf_url`,
the sitemap and every OAI record point at.

### A3 — Hosting

Everything crawler-facing is currently unreachable: the app runs on localhost.
Google Scholar in particular will not index content it cannot fetch over a
public HTTPS URL.

**Answered 2026-09-12.** The production domain is
`https://journal.damascusuniversity.edu.sy`, and DNS and TLS are administered by
the Damascus University ICT centre. Both `.env.example` files now carry that
value in a comment; the live `.env` files still point at localhost, because
setting it is a deployment step rather than a repository one.

*Still missing (**G11**):* where the application is actually hosted, who deploys
it, whether there is a staging origin, and who issues the TLS certificate.

*Code status: finished and waiting.* Set `PUBLIC_SITE_URL` as described above
and the sitemap, robots policy, canonical URLs, hreflang alternates, citation
tags and OAI-PMH endpoint all become live at once. Nothing else needs changing.

### A4, A5, A7 — what is already built

- **A4 (Search Console).** `sitemap.xml` covers the portal, all nine journals,
  every released issue and every published article, with `en`/`ar` alternates,
  regenerated hourly. `robots.txt` blocks the editorial workspace but keeps
  `/api/v1/public/` crawlable, because that is where article PDFs are served.
  After A3: verify the domain and submit `<site>/sitemap.xml`.
- **A5 (Google Scholar).** Article pages are server-rendered and carry
  `citation_title`, `citation_author` (one tag per author), `citation_*_date`,
  `citation_journal_title`, `citation_issue`, `citation_volume`,
  `citation_pdf_url` and `citation_keywords` in the served HTML, plus
  `ScholarlyArticle` JSON-LD. `citation_issn` appears once A1 lands. After A1
  and A3: submit the inclusion request.
- **A7 (BASE / OpenAIRE).** OAI-PMH 2.0 over Dublin Core, all six verbs,
  one set per journal. Retractions are published as `status="deleted"` records
  so aggregators drop them rather than serving a retracted paper indefinitely.
  After A3, the base URL to register is:

  ```
  <site>/api/v1/oai
  ```

  Check it first with the OpenAIRE validator or
  <https://www.openarchives.org/Register/ValidateSite>.

---

## B. Institutional decisions and policy text

DOAJ and most indexing services require these to be **published on the site**,
not merely practised. I can build every page; the wording is an institutional
commitment and yours to approve.

| # | Action | Status | Notes |
|---|--------|--------|-------|
| B1 | Choose an **open-access licence** per journal | **done 2026-09-12** | **CC BY-NC**, all nine journals and the whole back catalogue. `OAI_RIGHTS_STATEMENT` is now set in `backend/.env.example` and emitted as `dc:rights` |
| B2 | Approve a **peer-review policy** statement | **decided 2026-09-12** | Double-anonymous, which is what Folio already implements. **Page not built, G4** |
| B3 | Approve a **publication ethics** statement | **decided 2026-09-12** | COPE guidelines; similarity report required at submission, quotation 20% maximum. **Page not built, G4** |
| B4 | Approve an **archiving / preservation** policy | **decided 2026-09-12** | No paid external preservation; local university backups only, stated honestly. **Page not built, G4** |
| B5 | State **author charges** | **decided 2026-09-12** | No APCs for faculty and postgraduates. Whether a nominal local fee exists for anyone else is **G12**. **Page not built, G4** |
| B6 | Provide the **editorial board** per journal | **in the university's hands 2026-09-14** | Built: the journal manager or each editor-in-chief enters the board (names, affiliations, roles, ORCID iDs) and it is published at `/journals/<slug>/editorial-board`, the URL DOAJ asks for. The names are for each journal to enter |

**The decisions are made; the pages are not built.** DOAJ and every indexing
service require these to be *published on the site*, and Folio currently has no
public policy pages at all - no `/about`, no `/policies` (the editorial board page now exists). The approved commitments are recorded in
[`PRESS-PROFILE.md`](./PRESS-PROFILE.md); turning them into published pages is
**G4**, and it is now the largest piece of buildable work standing between
Folio and a DOAJ application.

---

## C. Operations and secrets

| # | Action | Status | Notes |
|---|--------|--------|-------|
| C1 | Commit to backup **frequency, destination and retention** | **done 2026-09-12** | Daily 02:00 full backup, weekly encrypted off-site copy, 90-day retention. Procedure was already in [`DEPLOYMENT.md`](./DEPLOYMENT.md) §Backup and restore |
| C2 | State an **RPO and RTO**, then run a **timed restore drill** | **stated 2026-09-12**, drill not run | RPO 24 hours, RTO under 4 hours. The drill has not been run, and its duration *is* the real RTO |
| C3 | Generate production secrets | **authorised 2026-09-12**, not done | The university has directed that every pre-2026-09-08 key be wiped and regenerated: `JWT_SECRET` (32+ chars), `DB_PASSWORD` (kept out of any git repository), `TYPESENSE_API_KEY`, `EMAIL_SERVICE_TOKEN`, `AI_SERVICE_TOKEN`. This is the rotation the log-hygiene section below already asked for |
| C4 | SMTP provider account | **decided 2026-09-12**, values missing - G9 | The DU mail server over the secure port. Host / port / TLS / credentials have not been supplied |

`validate-runtime-config.ts` already refuses to boot production with placeholder
values for C3, so this is enforced rather than merely documented.

For C1 and C2 the *mechanism* was already documented and correct. What was
missing was the commitment, and it arrived on **2026-09-12**: a full backup
daily at 02:00 (database plus uploaded PDFs), held on university servers with a
weekly encrypted copy to a physically separate off-site server, 90-day
retention, **RPO 24 hours** and **RTO under 4 hours**.

One thing is still outstanding and cannot be supplied on paper: the **timed mock
recovery test**. The university has committed to running one before launch, and
its measured duration *is* the real RTO. Until a restore has actually been
performed and timed, 4 hours is a target, not a number.

`DEPLOYMENT.md` still holds the procedure it always did: the `pg_dump` commands
for both databases, the uploads volume tarball, and the warning that a database
restore without the matching uploads archive produces submissions whose files
404. That warning is what makes the drill worth timing.

---

## Log hygiene — one-time cleanup

Fixed in code on 2026-09-08: request logs previously wrote the session cookie,
`Authorization` header and the `x-folio-service-token` shared secret verbatim on
every request. The leak is closed, but **logs written before that fix still
contain live credentials**.

*What you need to do:*

1. Search existing log archives for `folio_access=`, `folio_refresh=` and
   `Bearer ` and purge or rotate what you find.
2. Rotate `EMAIL_SERVICE_TOKEN` and `AI_SERVICE_TOKEN` — both are long-lived
   shared secrets that appeared in plaintext in every internal request log.
3. `JWT_SECRET` rotation is optional but invalidates every leaked session token
   at once; session cookies otherwise expire on their own `JWT_EXPIRES_IN`.

---

## Still missing

What Damascus University supplied on 2026-09-12 is recorded in
[`PRESS-PROFILE.md`](./PRESS-PROFILE.md). This table is what that did **not**
answer, and where each item stood after the university's replies of
**2026-09-14**.

| # | Item | Status 2026-09-14 | What happens now |
|---|------|------------------|------------------|
| G1 | **Which nine journals** | **resolved** | Folio's nine stand. مجلة التخطيط المستدام is dropped; مجلة الدراسات التاريخية (`hisj`) stays. No catalog or URL change |
| G1b | **Exact registered titles** (e.g. `medj`: العلوم الطبية or العلوم الطبية والصحية) | **moved into the app** | The journal manager edits titles at *Journal details*. Journal manager only, because Scholar and DOAJ match on the title |
| G2 | **ISSNs for `hisj`, `eduj`, `agrj`** | **moved into the app**; numbers still to come | The journal manager or that journal's editor-in-chief enters them. The check digit is validated on save |
| G3 | **Aims and scope per journal**, Arabic and English | **moved into the app** | Written by each journal's editor-in-chief (or the journal manager), and updated when the editor-in-chief changes each year |
| G4 | **Policy pages** | **deferred** by the university | Left as they are for now. Still required before a DOAJ application |
| G5 | **Logo file** (SVG plus a square PNG) | **promised**, not received | Nothing to do until it arrives |
| G6 | **Existing DOI prefix?** | **answered: none** | No free route through an existing membership. The build note below stands |
| G7 | **Editors-in-chief, boards, section editors** | **entered by the university in the app** | Staff accounts: the journal manager invites each person, then sets *Editor-in-chief of* or the section-editor journals on the users screen. The published board, including members who never log in, is entered at *Journal details → Editorial board* and appears at `/journals/<slug>/editorial-board` |
| G8 | **What "ORCID required" means** | **decided and enforced** | ORCID is the primary identifier of every participant: required at registration with a validated check digit, accounts without one held at `/complete-profile`, never removable. See PRESS-PROFILE §6 |
| G9 | **SMTP host, port, TLS, credentials, From address** | open, **deferred** | Still blocks every outbound email. `ojs.admin@…` must also exist as a real, monitored mailbox |
| G10 | **Back-catalogue logistics** | open, **deferred** | Still blocks the archive import and the OCR pass |
| G11 | **Hosting** (server, deployer, staging, TLS issuer) | open, **deferred** | Still blocks A3, and therefore A4, A5 and A7 |
| G12 | **Exact author-charges sentence**, including external authors | open, **to be supplied later** | Still needed for B5 and DOAJ |

### A note on G6 and the DOI directive

The university's instruction is to keep the DOI module active in code but
unwired, with the prefix field prepared in the database. That is exactly this
file's working policy, and it is **not yet built** — there is no publisher-side
DOI anywhere in the codebase today (the only `doi` fields belong to reference
list entries inside a manuscript). The build is: a `doi_prefix` column on
`journals`, a `doi` column on `submissions`, minting inside the existing publish
transaction behind a flag that stays off, and the Crossref deposit XML written
but never posted. None of it needs a prefix to be written; all of it stays inert
until one exists.

## How to use this file

Add a row when work stops because something outside the repository is missing.
Move it to `done` with a date rather than deleting it, so the history of what
was set up survives.
