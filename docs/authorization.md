# Authorization layers

Damascus University Journal uses four complementary checks. They are not duplicates of the same rule — each layer answers a different question.

| Layer | Where | Question |
|-------|-------|----------|
| **Route gate** | `@Permissions()` + `PermissionsGuard` on HTTP controllers | Does the caller hold at least one required permission slug (OR)? |
| **Caller gate** | `assertCallerPermission()` / `assertCallerHasAnyPermission()` / `assertCallerHasEveryPermission()` in services | Same slug logic, for methods also reached from seed, tests, or future non-HTTP callers |
| **Journal scope** | `JournalMembershipService` + `journal_memberships` | Which journals may this staff user exercise that permission in? |
| **Resource gate** | `assertCanRead`, ownership, assignment, workflow state | Can this caller access **this** submission, file, or assignment? |

## Journal scope

Now that Folio is a press of nine journals, a permission says *what* a staff user
may do and a membership says *where*. RBAC stays university-wide; `journal_memberships`
narrows it.

- **`journal_manager` is one seat per journal.** The membership is stored like
  the editor-in-chief seat. A manager sees the queue, titles, and sections of
  those journals only. Email templates, reminder policy, and the audit log stay
  one site-wide copy and are not filtered by journal.
- **An editor with no memberships is scoped to nothing**, not to everything. The
  opposite default would silently leave the scope unenforced for exactly the
  accounts nobody has configured yet.
- **Every submission has a journal.** `submissions.journal_id` is `NOT NULL`
  since `SubmissionJournalRequired`, so there is no unplaced triage bucket: an
  editor sees their journals and nothing else, and one with no memberships gets
  an empty queue without a database round-trip.
- Section-editor suggestions match on the submission's **journal**, not on its
  discipline tags. The staff-admin surface speaks journal slugs
  (`GET/PUT /users/:id/section-editor-journals`) — the same identifiers the
  portal URLs use. It spoke Arabic discipline labels until slice 7, which only
  worked because `journals.discipline_label` is unique and 1:1 with the
  classifier labels (`user_section_editor_disciplines` was dropped in
  `1783200000000-JournalScopedSectionEditors`).
- **Slug access uses the same scope as the queue.**
  `SubmissionAccessService.staffSubmissionInScope` allows an `editor` or
  `journal_manager` on journals where they hold that membership, and a
  `section_editor` only on submissions that have a `section_editor_assignments`
  row for them. Section-editor membership does not open the journal queue.
  `assertCanRead` applies it to `submission.view_editor_queue` after the draft
  check. Staff mutations that load a submission by slug call it too. Author,
  reviewer, and assigned copyeditor rules are unchanged.
- **Editors-in-chief are placed the same way**, through
  `GET/PUT /users/:id/editor-journals` (role `editor`, "Editor-in-chief of" on
  the users screen). Before this endpoint only the seed could create editor
  memberships, so a real editor-in-chief had an empty queue. Damascus
  University changes editors-in-chief yearly and enters them itself, so this is
  the handover step.

## Journal metadata

Titles, ISSNs and aims and scope are edited in the app (`PATCH /journals/:slug`,
page `/journal-manager/journals`), under a split the university set on
2026-09-14:

| Field | Permission | Held by | Scope |
|-------|------------|---------|-------|
| `issn`, `eissn`, `description_ar`, `description_en` | `journal.edit_metadata` | `editor`, `journal_manager` | journals where the caller holds `editor` or `journal_manager` |
| `title_ar`, `title_en` | `journal.edit_titles` | `journal_manager` only | journals where the caller holds `journal_manager` |
| Sections and section-editor links | `journal.edit_metadata` | `journal_manager` only | journals where the caller holds `journal_manager` |
| Editorial board (`editorial_board_members`) | `journal.edit_metadata` | `editor`, `journal_manager` | same as ISSNs |

The guard checks `journal.edit_metadata`; `JournalMetadataService` checks the
membership and the title permission, because the guard can see neither. An
unchanged title in the request body is not an edit, so a form that always sends
every field does not trip the title rule for an editor.

Shared helpers live in `backend/src/common/authorization/permission-checks.ts`. The guard uses the same `hasAnyPermission()` implementation as services.

## Canonical policy

### HTTP controllers

- **`@Permissions()` is the route gate.** Every handler on a guarded controller must declare `@Permissions(...)` or `@AllowAuthenticated()`.
- Permission slugs are OR unless documented otherwise. For AND requirements, enforce in the service layer (see suggested reviewers below).
- Prefer grouped constants from `backend/src/rbac/permission-slugs.ts` when a route mirrors service logic (`SUBMISSION_READ_PERMISSIONS`, etc.).

### Services

- **Resource rules always live in services** — guards cannot see submission rows, assignments, or draft visibility.
- **Caller slug checks belong in services when the method has a non-HTTP entry point** (today: `seed.ts`, unit tests). Use `assertCallerPermission()` from `permission-checks.ts`.
- **Do not re-check the same slug in HTTP-only services** when the controller already declares an exact match. Rely on the guard and keep only resource validation (e.g. draft hidden from editor queue).
- **`RbacService.userHasPermission(userId, slug)`** validates a **target user** (assignee role), not the caller. Never use it for caller auth.

### Jobs, cron, and system paths

- No `RequestUser`. Enforce business invariants (published status, idempotency keys) instead of RBAC slugs.
- Example: AI job processor checks `SubmissionStatus.PUBLISHED`, not editor permissions.

## Permission slug groups

Defined in `permission-slugs.ts` and kept in sync with controllers and services:

| Constant | Match |
|----------|-------|
| `SUBMISSION_READ_PERMISSIONS` | OR slugs for `assertCanRead` entry paths |
| `SUBMISSION_LIST_PERMISSIONS` | OR slugs for author list vs editor queue list |
| `EDITOR_REVIEW_CONFIG_PERMISSIONS` | OR slugs for review-method / file-stage setup routes |
| `ASSIGNMENT_REMINDER_PERMISSIONS` | OR slugs for assignment reminder admin routes |
| `SUGGESTED_REVIEWERS_CALLER_PERMISSIONS` | Assign permission. The service also requires staff scope, and only offers that journal's reviewers |

## Service entry-point audit

Methods below declare why caller checks are kept or omitted.

| Method | Caller check | Reason |
|--------|--------------|--------|
| `SubmissionLifecycleService.updateStatus` | `assertCallerPermission(CHANGE_STATUS)` | seed + HTTP |
| `ReviewWorkflowService.assignReviewer` | `assertCallerPermission(ASSIGN_REVIEWER)` | seed + HTTP |
| `CopyeditWorkflowService.assignCopyeditor` | `assertCallerPermission(ASSIGN_COPYEDITOR)` | seed + HTTP |
| `CopyeditWorkflowService.publishSubmission` | `assertCallerPermission(COPYEDIT_PUBLISH)` plus assigned copyeditor **or** `VIEW_EDITOR_QUEUE` | seed + HTTP |
| `CopyeditWorkflowService.retractSubmission` | `assertCallerPermission(VIEW_EDITOR_QUEUE)` | HTTP |
| `SubmissionAiService.getSuggestedReviewers` | `assertCallerHasEveryPermission(ASSIGN_REVIEWER)` plus `assertStaffSubmissionScope` | candidates are reviewer members of that journal |
| `ReviewWorkflowService.listAssignments` | `assertCanRead` | Guard slug is held by section editors too — see below |
| `CopyeditWorkflowService.listCopyeditAssignments` | `assertCanRead` | Same rule, kept symmetrical |
| `ReviewWorkflowService.updateReviewMethod` | none | HTTP-only; guard matches OR list |
| `RemindersService.*` | none | HTTP-only; guard matches OR list; service validates submission/assignment scope |
| `SubmissionAccessService.assertCanRead` | resource gate | always in service |
| `RbacService.userHasPermission` | target user | assignee validation only |

## Examples

**Read submission (`GET /submissions/:slug`)**

1. Guard: caller has one of `SUBMISSION_READ_PERMISSIONS`.
2. Service: `assertCanRead` — drafts stay hidden from staff. A caller with `submission.view_editor_queue` or `submission.view_section_queue` must also be in journal scope. Author, reviewer, and copyeditor rules still apply.

**Assign reviewer (`POST …/assign-reviewer`)**

1. Guard: `SUBMISSION_ASSIGN_REVIEWER`.
2. Service: same slug via `assertCallerPermission` (seed calls this directly), then `assertStaffSubmissionScope`.
3. Service: the reviewer must hold a `reviewer` membership on the submission's journal (`REVIEWER_NOT_IN_JOURNAL` otherwise), and `userHasPermission(reviewerId, REVIEW_SUBMIT)`.
4. Service, inside the invitation transaction: re-read the reviewer `FOR UPDATE`, then refuse `REVIEWER_UNAVAILABLE` or `REVIEWER_AT_CAPACITY` (invited + accepted ≥ `reviewer_max_active_reviews`). The row lock is what stops two editors inviting at once from both seeing "2 of 3". Rules live in `reviewer-availability.ts`, shared with the reviewer directory.

**Reviewer directory (`GET /submissions/:slug/reviewer-directory[/:reviewerId]`)**

1. Guard: `SUBMISSION_ASSIGN_REVIEWER`.
2. Service: `assertCanRead` — required for the same reason as the assignment list: `section_editor` holds the slug, and the directory carries every reviewer's email and workload.
3. The detail's recent-assignment titles are limited to journals the caller holds `editor`, `section_editor`, or `journal_manager` membership in, plus the manuscript in hand. Opening one paper does not reveal every other title in that journal.

**List reviewer assignments (`GET /submissions/:slug/assignments`)**

1. Guard: `SUBMISSION_LIST_ASSIGNMENTS`.
2. Service: `assertCanRead` — **required**, not optional. The slug is held by
   `editor`, `journal_manager` *and* `section_editor`. A section editor is scoped
   by assignment everywhere else in the system, so without the resource gate they
   could read the reviewer roster — names and email addresses — for any
   submission outside their own scope by guessing or discovering its slug.
3. Response is mapped through `assignment-response.mapper.ts`. The repository
   loads `reviewer` as a full `User`; returning the row directly ships
   `passwordHash`.

> A guard slug is never sufficient on its own when any role holding it is scoped
> by assignment. Ask "who else holds this slug?" before choosing "resource only".

**Assignment reminders (`GET …/reminders`)**

1. Guard: one of `ASSIGNMENT_REMINDER_PERMISSIONS` (editors **or** journal managers).
2. Service: verifies submission and assignment exist — **no slug re-check** (journal managers lack `SUBMISSION_LIST_ASSIGNMENTS`).

## Adding a new route

1. Add `@Permissions(...)` on the controller handler.
2. If the service method is **only** called from HTTP and the guard slug matches exactly → resource checks only in the service.
3. If seed, jobs, or CLI will call the service → add `assertCallerPermission()` (or AND/OR variant).
4. If the route needs finer rules than OR slugs → resource gate in the service; document any AND requirement in `permission-slugs.ts`.
5. Extend `permission-slugs.ts` constants when the same slug set appears in guard and docs.

## Related code

- `backend/src/common/guards/permissions.guard.ts`
- `backend/src/common/decorators/permissions.decorator.ts`
- `backend/src/submissions/submission-access.service.ts`
- `backend/src/rbac/rbac.service.ts` (`userHasPermission` for assignees)
