## 3️⃣ Coverage & Matching Metrics

- **0 of 10** tests passed (0%)
- **~7 of 10** failures appear to be **test harness / contract mismatches** (HTTP 201 login, nested `user.email`, missing CSRF)
- **~1–2** failures may reflect **real API client requirements** (CSRF on POST, possible 403 on status patch)
  | Requirement | Total Tests | ✅ Passed | ❌ Failed |
  |------------------------|-------------|-----------|-----------|
  | Authentication | 3 | 0 | 3 |
  | Submissions workflow | 3 | 0 | 3 |
  | Review assignments | 3 | 0 | 3 |
  | Notifications | 1 | 0 | 1 |
  | **Total** | **10** | **0** | **10** |

---

## 4️⃣ Key Gaps / Risks

> **Summary:** TestSprite executed 10 backend API tests against the running Folio stack. **No tests passed on paper (0%)**, but most failures are **generated-test issues**, not product regressions. Login and register endpoints return valid sessions; tests incorrectly require HTTP 200 on login and top-level `email` on register.
> **Risks / follow-ups:**

1. **CSRF on mutating API calls** — Any external API client (including TestSprite) must send `X-CSRF-Token` from the login/register response on POST/PATCH/DELETE. TC009 confirms this guard is active.
2. **Login HTTP status** — `POST /auth/login` returns 201 today. Harmless for the SPA, but surprises OpenAPI consumers and auto-generated tests expecting 200.
3. **Role-aware test data** — Submission create/submit tests should use the seeded **author** account, not editor credentials.
4. **Frontend UI untested** — This run targeted backend API only. Folio’s primary UX (Next.js pages, constructor, i18n) was not covered; a separate `testsprite_generate_frontend_test_plan` pass is recommended.
5. **TC006 403** — Investigate with editor + CSRF + known seed submission slug before treating as a product bug.
   **Recommended next steps:**

- Re-run with `additionalInstruction` documenting CSRF header requirement and accepting login 201.
- Optionally add `@HttpCode(200)` on `auth.controller.ts` login for REST consistency.
- Run frontend TestSprite plan against `http://localhost:5240` for UI coverage.

---
