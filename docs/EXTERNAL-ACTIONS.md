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

---

## A. Scholarly indexing

Without these, published articles cannot enter the scholarly record. This is the
gap between "a working peer-review system" and "a journal".

| # | Action | Status | Blocks | Code waiting? |
|---|--------|--------|--------|---------------|
| A1 | Obtain an **ISSN** for each of the nine journals | open | A5, A6, credibility in Scholar | **Yes — finished.** Columns exist and are all null; portal, `citation_issn` and Dublin Core all emit them the moment they are set, and omit them cleanly until then |
| A2 | **Crossref** membership + DOI prefix | open | DOI minting, Crossref deposit | Not yet built |
| A3 | Public **domain + HTTPS hosting** | open | A4, A5, A6, A7 — everything crawler-facing | **Yes — finished.** Set `PUBLIC_SITE_URL` in both services (see below) |
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

*What I need from you:* up to eighteen numbers — an ISSN and an e-ISSN per
journal — mapped to slugs (`artsj`, `hisj`, `basj`, `econj`, `eduj`, `agrj`,
`medj`, `lawj`, `engj`). A partial list is fine and worth sending as it comes;
rows stay null until filled.

*Code status: finished and waiting.* `journals.issn` and `journals.eissn` exist
and are null for every row. The journal page, the `citation_issn` meta tag and
the Dublin Core `dc:source` element each render the number when present and omit
the field entirely when null — no placeholders anywhere. Seeding the list is an
afternoon.

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

*What I need from you:* the prefix (e.g. `10.12345`) and Crossref deposit
credentials. I will build minting into the existing publish transaction and the
Crossref deposit XML behind a flag, so it stays inert until those exist.

### A3 — Hosting

Everything crawler-facing is currently unreachable: the app runs on localhost.
Google Scholar in particular will not index content it cannot fetch over a
public HTTPS URL.

*What I need from you:* the production domain, and confirmation of who
administers DNS and TLS.

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
| B1 | Choose an **open-access licence** per journal | open | CC BY, CC BY-NC, CC BY-NC-ND… affects reuse rights. Code waiting: set `OAI_RIGHTS_STATEMENT` and it is emitted as `dc:rights` to every harvester; until then the element is omitted rather than guessed |
| B2 | Approve a **peer-review policy** statement | open | Must state the model — Folio defaults to double-anonymous |
| B3 | Approve a **publication ethics** statement | open | Optional: COPE membership (annual fee) |
| B4 | Approve an **archiving / preservation** policy | open | Optional: CLOCKSS or Portico (fee) |
| B5 | State **author charges** | open | "No APCs" is a valid and strong answer |
| B6 | Provide the **editorial board** per journal | open | Real names, affiliations, roles |

For B1–B5 I will draft the text and mark it clearly as a draft awaiting
approval. Draft text is never published as policy without your sign-off.

---

## C. Operations and secrets

| # | Action | Status | Notes |
|---|--------|--------|-------|
| C1 | Commit to backup **frequency, destination and retention** | open | Procedure already exists in [`DEPLOYMENT.md`](./DEPLOYMENT.md) §Backup and restore; the schedule and retention do not |
| C2 | State an **RPO and RTO**, then run a **timed restore drill** | open | Neither number is currently stated anywhere; the drill's duration *is* the RTO |
| C3 | Generate production secrets | open | `JWT_SECRET` (32+ chars), `DB_PASSWORD`, `TYPESENSE_API_KEY`, `EMAIL_SERVICE_TOKEN`, `AI_SERVICE_TOKEN` |
| C4 | SMTP provider account | open | For real outbound mail from `services/email-service` |

`validate-runtime-config.ts` already refuses to boot production with placeholder
values for C3, so this is enforced rather than merely documented.

For C1 and C2, note that the *mechanism* is already documented and correct —
`DEPLOYMENT.md` gives the `pg_dump` commands for both databases, the uploads
volume tarball, and the warning that a database restore without the matching
uploads archive produces submissions whose files 404. What is missing is the
commitment: how often, kept how long, and evidence that a restore has actually
been performed.

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

## How to use this file

Add a row when work stops because something outside the repository is missing.
Move it to `done` with a date rather than deleting it, so the history of what
was set up survives.
