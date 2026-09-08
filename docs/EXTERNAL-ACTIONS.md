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
| A1 | Obtain an **ISSN** for each of the nine journals | open | A5, A6, credibility in Scholar | Yes — columns exist, all null |
| A2 | **Crossref** membership + DOI prefix | open | DOI minting, Crossref deposit | Not yet built |
| A3 | Public **domain + HTTPS hosting** | open | A4, A5, A6, A7 — everything crawler-facing | No |
| A4 | **Google Search Console** verification, submit sitemap | blocked by A3 | Google indexing | Sitemap not yet built |
| A5 | **Google Scholar** inclusion request | blocked by A1, A3 | Scholar indexing | Citation tags not yet built |
| A6 | **DOAJ** application | blocked by A1, B1–B5 | Directory listing, credibility | Policy pages not yet built |
| A7 | Register OAI base URL with **BASE / OpenAIRE** | blocked by A3 | Aggregator harvesting | OAI-PMH not yet built |

### A1 — ISSN (start here)

Each journal needs its own ISSN; a print journal and its electronic version need
separate ISSN and e-ISSN. **Check with the Damascus University library first** —
the nine series are long-running print journals and very likely already hold
ISSNs. Only apply for new numbers for the electronic versions if they lack them.

Issued nationally, free in most countries, via the Syrian national ISSN centre
(the ISSN International Centre lists national centres).

*What I need from you:* nine numbers, mapped to slugs
(`artsj`, `hisj`, `basj`, `econj`, `eduj`, `agrj`, `medj`, `lawj`, `engj`).
The `journals.issn` and `journals.eissn` columns already exist and are currently
null for every row; I can seed them and surface them on the portal the same day
you have the list.

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

---

## B. Institutional decisions and policy text

DOAJ and most indexing services require these to be **published on the site**,
not merely practised. I can build every page; the wording is an institutional
commitment and yours to approve.

| # | Action | Status | Notes |
|---|--------|--------|-------|
| B1 | Choose an **open-access licence** per journal | open | CC BY, CC BY-NC, CC BY-NC-ND… affects reuse rights |
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
