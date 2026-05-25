/**
 * Canonical `packages/shared` files and their compile-time mirrors.
 * Edit only the canonical path; run `npm run sync:shared` from repo root.
 */
export const SHARED_MIRROR_GROUPS = [
  {
    canonical: "packages/shared/contracts/email-events.ts",
    mirrors: [
      "backend/src/messaging/contracts/email-events.ts",
      "services/email-service/src/contracts/email-events.ts",
    ],
  },
  {
    canonical: "packages/shared/messaging/topology.ts",
    mirrors: [
      "backend/src/messaging/shared/topology.ts",
      "services/email-service/src/shared/topology.ts",
    ],
  },
  {
    canonical: "packages/shared/messaging/idempotency.ts",
    mirrors: [
      "backend/src/messaging/shared/idempotency.ts",
      "services/email-service/src/shared/idempotency.ts",
    ],
  },
  {
    canonical: "packages/shared/messaging/redactor.ts",
    mirrors: [
      "backend/src/messaging/shared/redactor.ts",
      "services/email-service/src/shared/redactor.ts",
    ],
  },
];
