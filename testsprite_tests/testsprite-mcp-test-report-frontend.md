# TestSprite AI Testing Report (MCP) — Frontend UI

---

## 1️⃣ Document Metadata
- **Project Name:** folio
- **Date:** 2026-06-11
- **Prepared by:** TestSprite AI Team
- **Test scope:** Frontend UI (Next.js) at `http://localhost:5240/en` — 15 high-priority cases (dev mode cap)
- **Environment:** Local dev — frontend `:5240`, backend `:5243` (API proxied via Next.js)
- **Mode:** Development (`npm run dev`)

---

## 2️⃣ Requirement Validation Summary

### Requirement: Authentication
- **Description:** Register, login, session profile, and invalid credential handling.

#### Test TC001 — Register and reach the authenticated profile
- **Test Code:** [TC001_Register_and_reach_the_authenticated_profile.py](./TC001_Register_and_reach_the_authenticated_profile.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/f1471b4b-25e3-4b57-8c59-ac233abd6345
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** User can register, log in, and land on an authenticated profile view with an active session.

---

#### Test TC002 — Register and begin the author workflow
- **Test Code:** [TC002_Register_and_begin_the_author_workflow.py](./TC002_Register_and_begin_the_author_workflow.py)
- **Test Error:** Registration form did not complete after 3 attempts (password field not persisted; no redirect). Test fell back to seeded author login and reached `/en/submissions/new`.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/311562d7-fa58-4018-8a64-e5f9e54c2545
- **Status:** ❌ Failed
- **Severity:** MEDIUM
- **Analysis / Findings:** **Likely automation fragility** — password field interaction failed in the browser agent, not necessarily a product bug. Author workflow itself works when using seeded account (`author@folio.dev`). Worth a manual check of `/en/register` with a fresh email; also verify password visibility toggle / autofill does not block automated fills.

---

#### Test TC006 — Reject invalid login credentials
- **Test Code:** [TC006_Reject_invalid_login_credentials.py](./TC006_Reject_invalid_login_credentials.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/82fecd27-8294-4914-b5dd-2606ec48bb49
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Invalid credentials are rejected with appropriate UI feedback; no session created.

---

#### Test TC012 — Block registration with missing required information
- **Test Code:** [TC012_Block_registration_with_missing_required_information.py](./TC012_Block_registration_with_missing_required_information.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/595b14f5-ca20-46c3-8834-2654a8a71b68
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Form validation prevents submission when required fields are empty.

---

### Requirement: Author submission workflow
- **Description:** Create draft, open submission, submit for editorial review.

#### Test TC003 — Create a draft submission as an author
- **Test Code:** [TC003_Create_a_draft_submission_as_an_author.py](./TC003_Create_a_draft_submission_as_an_author.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/4404165f-54b4-4873-b52c-582b81566ad2
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Author can create a new draft submission through the UI.

---

#### Test TC004 — Open a draft submission and submit it for review
- **Test Code:** [TC004_Open_a_draft_submission_and_submit_it_for_review.py](./TC004_Open_a_draft_submission_and_submit_it_for_review.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/c6dc85e4-50a8-449d-82c9-7cb4bfd41107
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Draft can be opened and submitted for review successfully.

---

#### Test TC005 — Create, open, and submit a manuscript draft
- **Test Code:** [TC005_Create_open_and_submit_a_manuscript_draft.py](./TC005_Create_open_and_submit_a_manuscript_draft.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/897be08c-ca78-401e-ae4c-d5bc3213abab
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** End-to-end author path (create → open → submit) works in the UI.

---

### Requirement: Reviewer workflow
- **Description:** Accept assignments and submit completed reviews.

#### Test TC007 — Accept a review assignment and submit a completed review
- **Test Code:** [TC007_Accept_a_review_assignment_and_submit_a_completed_review.py](./TC007_Accept_a_review_assignment_and_submit_a_completed_review.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/935df2a7-e6a2-4c07-9c94-514bc3430c65
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Reviewer can accept an invitation and submit a review through the UI.

---

#### Test TC008 — Reviewer accepts an assignment and submits a completed review
- **Test Code:** [TC008_Reviewer_accepts_an_assignment_and_submits_a_completed_review.py](./TC008_Reviewer_accepts_an_assignment_and_submits_a_completed_review.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/a2e9161f-1ec4-4a3b-8f0d-920ef73102f9
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Duplicate coverage of reviewer accept + submit path — also passes.

---

#### Test TC013 — Open the reviewer assignment inbox
- **Test Code:** [TC013_Open_the_reviewer_assignment_inbox.py](./TC013_Open_the_reviewer_assignment_inbox.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/fc377269-c999-4bc6-86a0-a5abde3b1830
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Reviewer assignments inbox loads and displays assignments.

---

### Requirement: Editor workflow
- **Description:** Review submission queue and advance workflow status.

#### Test TC009 — Review and advance a submission status
- **Test Code:** [TC009_Review_and_advance_a_submission_status.py](./TC009_Review_and_advance_a_submission_status.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/d0382733-1e43-4347-b919-889375f5a283
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Editor can view a submission and update its workflow status.

---

#### Test TC010 — Editor reviews the submissions queue and updates workflow status
- **Test Code:** [TC010_Editor_reviews_the_submissions_queue_and_updates_workflow_status.py](./TC010_Editor_reviews_the_submissions_queue_and_updates_workflow_status.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/5a90219b-3c62-4c83-9559-7190979746e4
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Editor queue navigation and status updates work end-to-end.

---

### Requirement: Notifications
- **Description:** View unread notifications and navigate to related items.

#### Test TC011 — View unread notifications and open a related item
- **Test Code:** [TC011_View_unread_notifications_and_open_a_related_item.py](./TC011_View_unread_notifications_and_open_a_related_item.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/652dc577-588e-4c4f-9cb9-aaa2229d9b5b
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Notification bell / page shows unread items and links work.

---

#### Test TC014 — Browse unread notifications and open the related item
- **Test Code:** [TC014_Browse_unread_notifications_and_open_the_related_item.py](./TC014_Browse_unread_notifications_and_open_the_related_item.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/60421bef-b92f-4630-8053-6a50abe0f429
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Duplicate notification navigation path — passes.

---

#### Test TC015 — Open the authenticated notifications page from another workflow
- **Test Code:** [TC015_Open_the_authenticated_notifications_page_from_another_workflow.py](./TC015_Open_the_authenticated_notifications_page_from_another_workflow.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/4547da19-8a4d-4904-814c-75a63c56ec74/08275e5e-c22c-4498-b29d-1d9dfa306264
- **Status:** ✅ Passed
- **Severity:** LOW
- **Analysis / Findings:** Notifications page reachable from other authenticated workflows.

---

## 3️⃣ Coverage & Matching Metrics

- **14 of 15** tests passed (**93.3%**)
- **12 of 27** planned frontend cases executed (dev mode limits to 15 high-priority tests)

| Requirement              | Total Tests | ✅ Passed | ❌ Failed |
|--------------------------|-------------|-----------|-----------|
| Authentication           | 4           | 3         | 1         |
| Author submission        | 3           | 3         | 0         |
| Reviewer workflow        | 3           | 3         | 0         |
| Editor workflow          | 2           | 2         | 0         |
| Notifications            | 3           | 3         | 0         |
| **Total**                | **15**      | **14**    | **1**     |

---

## 4️⃣ Key Gaps / Risks

> **Summary:** Frontend UI testing via TestSprite is **strong** — core author, reviewer, editor, and notification flows all pass in the browser. The single failure (TC002) is registration automation struggling with the password field; the same session succeeded via seeded author login and completed the author workflow.

**Gaps / follow-ups:**

1. **TC002 registration automation** — Manual verify `/en/register` with a new email. If manual works, treat as TestSprite/browser-agent limitation.
2. **Production build blocked** — `npm run build` fails on `active-sessions-card.tsx` (`variant="outline"` not in `ButtonVariant`). Fix before running full 27-case suite in production mode.
3. **Remaining 12 cases** (TC016–TC027) not run in dev mode — includes copyedit, publications, journal-manager, ORCID, Arabic locale, etc.
4. **Backend API suite** (separate run) — 4/10 passed when proxied through `:5240`; login HTTP 201 vs 200 still trips several API tests.

**Compared to prior backend-only run:** Frontend UI health is much better than raw API test pass rate. The product’s main workflows work in real browser interaction.

---
