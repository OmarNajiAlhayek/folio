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

- **`journal_manager` is never scoped.** It is the university-wide role and reads
  as "every journal"; it holds no membership rows.
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
| `issn`, `eissn`, `description_ar`, `description_en` | `journal.edit_metadata` | `editor`, `journal_manager` | an editor: journals with an `editor` membership; the journal manager: all |
| `title_ar`, `title_en` | `journal.edit_titles` | `journal_manager` only | all |
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
| `SUGGESTED_REVIEWERS_CALLER_PERMISSIONS` | **AND** slugs enforced in service (`getSuggestedReviewers`; guard checks assign only) |

## Service entry-point audit

Methods below declare why caller checks are kept or omitted.

| Method | Caller check | Reason |
|--------|--------------|--------|
| `SubmissionLifecycleService.updateStatus` | `assertCallerPermission(CHANGE_STATUS)` | seed + HTTP |
| `ReviewWorkflowService.assignReviewer` | `assertCallerPermission(ASSIGN_REVIEWER)` | seed + HTTP |
| `CopyeditWorkflowService.assignCopyeditor` | `assertCallerPermission(ASSIGN_COPYEDITOR)` | seed + HTTP |
| `CopyeditWorkflowService.publishSubmission` | `assertCallerPermission(COPYEDIT_PUBLISH)` plus assigned copyeditor **or** `VIEW_EDITOR_QUEUE` | seed + HTTP |
| `CopyeditWorkflowService.retractSubmission` | `assertCallerPermission(VIEW_EDITOR_QUEUE)` | HTTP |
| `SubmissionAiService.getSuggestedReviewers` | `assertCallerHasEveryPermission(...)` | guard OR is looser than AND rule |
| `ReviewWorkflowService.listAssignments` | `assertCanRead` | Guard slug is held by section editors too — see below |
| `CopyeditWorkflowService.listCopyeditAssignments` | `assertCanRead` | Same rule, kept symmetrical |
| `ReviewWorkflowService.updateReviewMethod` | none | HTTP-only; guard matches OR list |
| `RemindersService.*` | none | HTTP-only; guard matches OR list; service validates submission/assignment scope |
| `SubmissionAccessService.assertCanRead` | resource gate | always in service |
| `RbacService.userHasPermission` | target user | assignee validation only |

## Examples

**Read submission (`GET /submissions/:slug`)**

1. Guard: caller has one of `SUBMISSION_READ_PERMISSIONS`.
2. Service: `assertCanRead` — author owns draft, editor skips drafts, reviewer must be assigned, etc.

**Assign reviewer (`POST …/assign-reviewer`)**

1. Guard: `SUBMISSION_ASSIGN_REVIEWER`.
2. Service: same slug via `assertCallerPermission` (seed calls this directly).
3. Service: `userHasPermission(reviewerId, REVIEW_SUBMIT)` — target must be a reviewer.

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
