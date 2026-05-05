# MVP user stories

Single-journal peer-review workflow. Detailed statuses and entities: [`DATA-MODEL.md`](./DATA-MODEL.md). API shape: [`API-NOTES.md`](./API-NOTES.md).

## Roles

| Role | Description |
|------|-------------|
| **Author** | Creates submissions, uploads files, responds to revision requests. |
| **Editor** | Manages the queue, assigns reviewers, records decisions, publishes accepted work. |
| **Reviewer** | Completes assigned reviews (comments + recommendation). |
| **Reader (public)** | Unauthenticated or generic access to the published catalog only. |

One user may hold multiple roles (e.g. Editor + Reviewer). Authorization rules in [`API-NOTES.md`](./API-NOTES.md). Editors see **reviewer candidates** only for users who have the reviewer role and have opted in with **willing to review** on their profile.

**Granting the editor role:** an existing editor sends a **role invitation**; the invitee accepts or declines **in the app** (e.g. dashboard). Direct `PATCH` that newly adds `editor` without an accepted invitation is rejected (see API notes).

---

## Author

### US-A1 — Register and sign in

- **As an** author, **I want** to create an account and sign in **so that** I can manage my submissions.
- **Acceptance criteria:** I can register with required fields (email, password, display name) and optional researcher profile fields (affiliation, ORCID in canonical form, review keywords/interests, willingness to serve as a reviewer). I can sign in and sign out. Invalid credentials are rejected with a clear message. Duplicate ORCID is rejected.

### US-A2 — Create and edit a draft submission

- **As an** author, **I want** to create a submission with journal-style metadata (article type, title, abstract, 3–6 keywords, structured author list with affiliations and one corresponding author, funding, declarations, AI-use statement, optional suggested/opposed reviewers) and edit it while in `draft` **so that** I can prepare before sending to the editor.
- **Acceptance criteria:** I see only my submissions. I can save and update metadata until I submit for review. Status remains `draft` until submit. Editors can read the same metadata on the submission record.

### US-A3 — Upload manuscript file

- **As an** author, **I want** to attach a structured file package (cover letter, title page, main manuscript, optional figures/tables/supplementary) **so that** editorial staff and reviewers receive the same artifact set as in major journal systems.
- **Acceptance criteria:** Each upload is tagged with a **file kind**. Submit is blocked until at least one file exists for each required kind: `cover_letter`, `title_page`, `manuscript`. Optional kinds may be added. I can add/remove files while in `draft` or `revisions_requested` per policy (see [`DATA-MODEL.md`](./DATA-MODEL.md)).

### US-A4 — Submit for review

- **As an** author, **I want** to submit my draft **so that** the editor can process it.
- **Acceptance criteria:** Submit is blocked unless the journal-style checklist is complete (article type, keywords count, contributors + corresponding author, declarations, ethics/AI statements, originality confirmation, and required file kinds). Status becomes `submitted`. I cannot revert to `draft` without an explicit policy (document if you allow withdrawal).

### US-A5 — View submission status

- **As an** author, **I want** to see the current status of my submissions **so that** I know what happens next.
- **Acceptance criteria:** I see status aligned with [`DATA-MODEL.md`](./DATA-MODEL.md) (`draft`, `submitted`, `under_review`, `revisions_requested`, `accepted`, `rejected`, `published`). I do not see other authors’ submissions.

### US-A6 — Respond to revisions requested

- **As an** author, **I want** to update my submission and resubmit when the editor requests revisions **so that** my work can re-enter review.
- **Acceptance criteria:** When status is `revisions_requested`, I can upload a new version and/or update metadata; resubmit moves status back to `submitted` (or your chosen transition—keep it consistent with the data model).

---

## Editor

### US-E1 — View submission queue

- **As an** editor, **I want** to see submissions that need editorial action **so that** I can process the journal.
- **Acceptance criteria:** I see submissions in `submitted`, `under_review`, `revisions_requested`, and `accepted` as appropriate to your queue design. I do not see arbitrary users’ passwords or secrets.

### US-E2 — Assign reviewers

- **As an** editor, **I want** to assign one or more reviewers to a submission **so that** peer review can proceed.
- **Acceptance criteria:** Assignments are recorded (`ReviewAssignment`) in **`invited`** state first. Reviewers see pending invitations (e.g. on the dashboard) and must **accept** before accessing manuscript files; then status is **`accepted`**. Moving the submission to `under_review` happens when at least one reviewer **accepts** (from `submitted`), **provided** the editor has placed at least one **`manuscript`** file in the **review** file stage (review package). The assign-reviewer picker lists only users who have the reviewer role **and** have **willing to review** set on their profile, and excludes reviewers who already have an **`invited` or `accepted`** assignment on that submission. Editors set **`review_method`** (open / single-blind / double-anonymous) and curate **`file_stage`** on files (OJS-style separation of editorial vs review files).

### US-E3 — View reviews

- **As an** editor, **I want** to read completed reviews **so that** I can make a decision.
- **Acceptance criteria:** I see review text and recommendation for assignments on that submission. Reviewers cannot see each other’s identities in API responses; `review_method` controls whether the author is anonymized to reviewers (`double_anonymous`) or not (`open` / single-blind `anonymous`).

### US-E4 — Record editorial decision

- **As an** editor, **I want** to record accept, reject, or revisions requested **so that** the author and system state stay aligned.
- **Acceptance criteria:** Decision updates submission status to `accepted`, `rejected`, or `revisions_requested`. `rejected` is terminal unless you explicitly allow appeal (out of scope for MVP unless you add it).

### US-E5 — Publish accepted submission

- **As an** editor, **I want** to publish an accepted submission **so that** it appears in the public list with metadata and file access.
- **Acceptance criteria:** Only from `accepted`, status becomes `published`. Published items appear in the public catalog (US-R1).

---

## Reviewer

### US-Rv1 — See assigned work

- **As a** reviewer, **I want** to see submissions assigned to me **so that** I know what to review.
- **Acceptance criteria:** List shows my assignments, including **`invited`** (respond via dashboard or assignments list) and **`accepted`** (active). I can open full submission metadata and files only after I **accept** the invitation.

### US-Rv2 — Submit a review

- **As a** reviewer, **I want** to submit written comments and a recommendation **so that** the editor can decide.
- **Acceptance criteria:** I can save a review linked to my assignment (recommendation e.g. accept / reject / revisions). I provide **comments for the author** and/or **confidential comments for the editor** (at least one required). I cannot submit two final reviews for the same assignment unless you allow “addendum” (default: one submitted review per assignment). I only download files from the **review package** (`file_stage = review`).

---

## Reader (public)

### US-R1 — Browse published articles

- **As a** reader, **I want** to browse a list of published submissions **so that** I can discover content.
- **Acceptance criteria:** List shows only `published` items with title, authors, abstract, and publication date (fields you implement). No auth required for this list unless you choose otherwise.

### US-R2 — Access published file

- **As a** reader, **I want** to download or open the published manuscript file **so that** I can read the full work.
- **Acceptance criteria:** File access is limited to the designated published artifact; draft or in-review files are not exposed on public routes.

---

## Out of scope (MVP)

Document these in your report as deliberate exclusions:

- Multiple journals or tenants; branding per institution beyond a single journal.
- Email notifications and real-time WebSockets (add after core flow, or stub in-app notifications first).
- OJS plugins, OAI-PMH, subscriptions, payments, ORCID integration.
- Full-text search, DOI minting, and production typesetting.

**Implemented:** OJS-style **review file stages**, **`review_method`** (including double-anonymous), and split reviewer comments (author vs editor-only). True anonymity still depends on editors/authors supplying non-identifying review-package files.

For OJS as reference only and academic honesty, see [`PROJECT-CONTEXT.md`](./PROJECT-CONTEXT.md).
