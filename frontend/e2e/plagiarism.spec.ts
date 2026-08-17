/**
 * Plagiarism detection E2E tests.
 *
 * Two tiers:
 *  1. Self-contained – author panel visibility (always runs, no seed needed)
 *  2. Opt-in – editor / reviewer flows with mocked AI API
 *     Set  E2E_PLAGIARISM_OPT_IN=1  and run `npm run seed` in backend first.
 *     Seeded accounts: editor@folio.dev / Editor123!  (and a reviewer account from seed)
 */

import {
  test as base,
  expect,
  request,
  type Page,
  type Route,
  type BrowserContext,
} from '@playwright/test';
import {
  apiV1Absolute,
  createSubmission,
  ensureUserExists,
  loginAndGetToken,
  loginStorageState,
  uniqueSubmissionTitle,
  withApiContext,
  workerCredentials,
} from './helpers/e2e-api';
import { hideNextJsDevPortals } from './helpers/hide-next-dev-portals';

// ── Seeded accounts ─────────────────────────────────────────────────────────

const EDITOR_CREDS = {
  email: 'editor@folio.dev',
  password: 'Editor123!',
  displayName: 'C. Editor',
};

const REVIEWER_CREDS = {
  email: 'ysryrwthqsdthwy@gmail.com',
  password: 'Reviewer123!',
  displayName: 'R. Reviewer',
};

const RUN_OPT_IN = process.env.E2E_PLAGIARISM_OPT_IN === '1';

// ── Direct cookie login (no ensureUserExists — seeded accounts already exist) ─

type CookieList = Parameters<BrowserContext['addCookies']>[0];

// Login via the Next.js proxy (localhost:5240) so cookies are set for localhost
// rather than 127.0.0.1. Direct backend login sets cookies for 127.0.0.1 which
// won't be sent to the frontend running on localhost.
const frontendPort = process.env.E2E_FRONTEND_PORT ?? '5240';
const frontendLoginUrl = `http://localhost:${frontendPort}/api/v1/auth/login`;

async function cookieLoginAs(creds: {
  email: string;
  password: string;
}): Promise<{ cookies: CookieList; token: string }> {
  const api = await request.newContext({
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });
  try {
    const res = await api.post(frontendLoginUrl, {
      data: { email: creds.email, password: creds.password },
    });
    if (!res.ok()) {
      throw new Error(
        `Login failed for ${creds.email}: ${res.status()} ${await res.text()}`,
      );
    }
    const body = (await res.json()) as { accessToken?: string };
    const state = await api.storageState();
    return {
      cookies: state.cookies as CookieList,
      token: body.accessToken ?? '',
    };
  } finally {
    await api.dispose();
  }
}

// ── Mock response builders ──────────────────────────────────────────────────

function buildCompletedJob(report: object) {
  return {
    jobId: 'mock-plagiarism-job',
    jobType: 'corpus_similarity',
    status: 'completed',
    result: report,
    createdAt: new Date(Date.now() - 4_000).toISOString(),
    completedAt: new Date().toISOString(),
  };
}

const REPORT_WITH_MATCHES = {
  status: 'ok',
  local: {
    enabled: true,
    threshold: 0.85,
    matchCount: 1,
    sources: [
      {
        articleId: 'mock-pub-001',
        maxSimilarity: 0.92,
        snippets: [
          {
            submissionSnippet:
              'This study examines the impact of open access policies on knowledge dissemination.',
            matchedSnippet:
              'This research examines the impact of open access on the dissemination of economic knowledge.',
            similarity: 0.92,
          },
        ],
        publication: {
          slug: 'demo-open-access-policies',
          title: '[Demo] Open-Access Policies in Arabic Journals',
          titleAr: '[Demo] سياسات الوصول المفتوح في المجلات العربية',
        },
      },
    ],
  },
  web: {
    enabled: true,
    threshold: 70,
    matchCount: 0,
    sources: [],
  },
};

const REPORT_CLEAR = {
  status: 'ok',
  local: { enabled: true, threshold: 0.85, matchCount: 0, sources: [] },
  web: { enabled: true, threshold: 70, matchCount: 0, sources: [] },
};

const REPORT_WITH_WEB_MATCHES = {
  status: 'ok',
  local: { enabled: true, threshold: 0.85, matchCount: 0, sources: [] },
  web: {
    enabled: true,
    threshold: 70,
    matchCount: 1,
    sources: [
      {
        sourceUrl: 'https://example-arabic-journal.org/article/economics',
        maxSimilarity: 82,
        snippets: [
          {
            querySnippet: 'تأثير سياسات الوصول المفتوح على نشر المعرفة',
            matchedSnippet: 'تأثير سياسات الوصول المفتوح في نشر البحوث العلمية',
            similarity: 82,
          },
        ],
      },
    ],
  },
};

const REPORT_WEB_NULL = {
  status: 'ok',
  local: { enabled: true, threshold: 0.85, matchCount: 0, sources: [] },
  web: null,
};

const REPORT_WEB_ERROR = {
  status: 'ok',
  local: { enabled: true, threshold: 0.85, matchCount: 0, sources: [] },
  web: {
    enabled: true,
    threshold: 70,
    matchCount: 0,
    sources: [],
    error: 'Google CSE quota exceeded',
  },
};

// ── Route-mock helper ───────────────────────────────────────────────────────

function mockPlagiarismRoutes(
  page: Page,
  slug: string,
  report: object,
  { latestNull = false }: { latestNull?: boolean } = {},
) {
  const enc = encodeURIComponent(slug);
  const completedJob = buildCompletedJob(report);

  void page.route(`**/${enc}/corpus-similarity/jobs/latest`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(latestNull ? null : completedJob),
    });
  });

  void page.route(`**/${enc}/corpus-similarity/jobs`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(report),
      });
    } else {
      await route.continue();
    }
  });

  void page.route(
    `**/${enc}/corpus-similarity/jobs/mock-plagiarism-job`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(completedJob),
      });
    },
  );
}

// ── Worker-user test (for author test) ─────────────────────────────────────

const test = base.extend<{ authToken: string }>({
  authToken: async ({}, use, testInfo) => {
    const creds = workerCredentials(testInfo.parallelIndex);
    const token = await withApiContext(async (api) => {
      await ensureUserExists(api, creds);
      return loginAndGetToken(api, creds);
    });
    await use(token);
  },
  page: async ({ page }, use, testInfo) => {
    const creds = workerCredentials(testInfo.parallelIndex);
    const state = await loginStorageState(creds);
    await page.context().addCookies(state.cookies);
    await use(page);
  },
});

test.setTimeout(60_000);

// ═══════════════════════════════════════════════════════════════════════════
// 1. Self-contained: author cannot see plagiarism panel
// ═══════════════════════════════════════════════════════════════════════════

test('author does not see plagiarism panel on own draft', async ({
  page,
  authToken,
}) => {
  const { slug } = await createSubmission(page.request, authToken, {
    title: uniqueSubmissionTitle('Plagiarism visibility test'),
    abstract: 'Abstract for plagiarism visibility test.',
  });

  await page.goto(`/en/submissions/${slug}`);
  await hideNextJsDevPortals(page);
  await page.waitForLoadState('networkidle');

  await expect(page.getByTestId('corpus-similarity-panel')).toHaveCount(0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Opt-in: editor flow (uses plain base test — no worker login overhead)
// ═══════════════════════════════════════════════════════════════════════════

base.describe('Plagiarism check — editor flow', () => {
  base.setTimeout(90_000);

  let editorCookies: CookieList = [];
  let queueSlug = '';

  base.beforeAll(async () => {
    if (!RUN_OPT_IN) return;

    const editorSession = await cookieLoginAs(EDITOR_CREDS);
    editorCookies = editorSession.cookies;
    const editorToken = editorSession.token;

    const submissions = await withApiContext(async (api) => {
      const res = await api.get(apiV1Absolute('submissions'), {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      if (!res.ok()) return [] as Array<{ slug: string; status: string }>;
      return res.json() as Promise<Array<{ slug: string; status: string }>>;
    });

    queueSlug =
      submissions.find((s) => s.status === 'submitted')?.slug ??
      submissions[0]?.slug ??
      '';
  });

  base.beforeEach(() => {
    base.skip(
      !RUN_OPT_IN,
      'Set E2E_PLAGIARISM_OPT_IN=1 with seeded backend (npm run seed)',
    );
  });

  base('panel is visible and shows similarity matches', async ({ page }) => {
    if (!queueSlug) {
      base.skip(true, 'No non-draft submission found in editor queue');
      return;
    }
    await page.context().addCookies(editorCookies);
    mockPlagiarismRoutes(page, queueSlug, REPORT_WITH_MATCHES);

    await page.goto(`/en/submissions/${queueSlug}`);
    await hideNextJsDevPortals(page);

    const panel = page.getByTestId('corpus-similarity-panel');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('corpus-similarity-toggle').click();

    const result = page.getByTestId('corpus-similarity-result');
    await expect(result).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByTestId('corpus-similarity-local-section'),
    ).toBeVisible();
    await expect(
      page.getByTestId('corpus-similarity-source').first(),
    ).toBeVisible();

    // 92% → red badge (above 0.85 threshold)
    await expect(result).toContainText('92%');

    await expect(
      page.getByTestId('corpus-similarity-checked-at'),
    ).toBeVisible();
    await expect(page.getByTestId('corpus-similarity-run-again')).toBeVisible();
  });

  base('panel shows clear result when no overlap found', async ({ page }) => {
    if (!queueSlug) {
      base.skip(true, 'No non-draft submission found in editor queue');
      return;
    }
    await page.context().addCookies(editorCookies);
    mockPlagiarismRoutes(page, queueSlug, REPORT_CLEAR);

    await page.goto(`/en/submissions/${queueSlug}`);
    await hideNextJsDevPortals(page);

    await page.getByTestId('corpus-similarity-toggle').click();

    const result = page.getByTestId('corpus-similarity-result');
    await expect(result).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId('corpus-similarity-source')).toHaveCount(0);
    await expect(
      page.getByTestId('corpus-similarity-web-section'),
    ).toBeVisible();
  });

  base('run-again re-triggers POST and updates results', async ({ page }) => {
    if (!queueSlug) {
      base.skip(true, 'No non-draft submission found in editor queue');
      return;
    }
    await page.context().addCookies(editorCookies);

    const enc = encodeURIComponent(queueSlug);
    let postCount = 0;

    void page.route(
      `**/${enc}/corpus-similarity/jobs/latest`,
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildCompletedJob(REPORT_CLEAR)),
        });
      },
    );
    void page.route(
      `**/${enc}/corpus-similarity/jobs`,
      async (route: Route) => {
        if (route.request().method() === 'POST') {
          postCount++;
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify(REPORT_WITH_MATCHES),
          });
        } else {
          await route.continue();
        }
      },
    );

    await page.goto(`/en/submissions/${queueSlug}`);
    await hideNextJsDevPortals(page);

    await page.getByTestId('corpus-similarity-toggle').click();
    await expect(page.getByTestId('corpus-similarity-result')).toBeVisible({
      timeout: 15_000,
    });
    expect(postCount).toBe(0);

    await page.getByTestId('corpus-similarity-run-again').click();
    // Mock returns immediately so loading flashes; wait for result directly
    await expect(page.getByTestId('corpus-similarity-result')).toBeVisible({
      timeout: 15_000,
    });
    expect(postCount).toBe(1);

    await expect(
      page.getByTestId('corpus-similarity-source').first(),
    ).toBeVisible();
  });

  base('panel shows unavailable when AI service is off', async ({ page }) => {
    if (!queueSlug) {
      base.skip(true, 'No non-draft submission found in editor queue');
      return;
    }
    await page.context().addCookies(editorCookies);

    const enc = encodeURIComponent(queueSlug);
    void page.route(
      `**/${enc}/corpus-similarity/jobs/latest`,
      async (r: Route) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'null',
        }),
    );
    void page.route(
      `**/${enc}/corpus-similarity/jobs`,
      async (route: Route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'unavailable' }),
          });
        } else {
          await route.continue();
        }
      },
    );

    await page.goto(`/en/submissions/${queueSlug}`);
    await hideNextJsDevPortals(page);

    await page.getByTestId('corpus-similarity-toggle').click();
    await expect(page.getByTestId('corpus-similarity-unavailable')).toBeVisible(
      { timeout: 15_000 },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Opt-in: reviewer flow
// ═══════════════════════════════════════════════════════════════════════════

base.describe('Plagiarism check — reviewer flow', () => {
  base.setTimeout(90_000);

  let reviewerCookies: CookieList = [];
  let reviewSlug = '';

  base.beforeAll(async () => {
    if (!RUN_OPT_IN) return;

    const reviewerSession = await cookieLoginAs(REVIEWER_CREDS);
    reviewerCookies = reviewerSession.cookies;

    const editorSession = await cookieLoginAs(EDITOR_CREDS);
    const editorToken = editorSession.token;

    const submissions = await withApiContext(async (api) => {
      const res = await api.get(apiV1Absolute('submissions'), {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      if (!res.ok()) return [] as Array<{ slug: string; status: string }>;
      return res.json() as Promise<Array<{ slug: string; status: string }>>;
    });

    reviewSlug =
      submissions.find((s) => s.status === 'under_review')?.slug ?? '';
  });

  base.beforeEach(() => {
    base.skip(
      !RUN_OPT_IN,
      'Set E2E_PLAGIARISM_OPT_IN=1 with seeded backend (npm run seed)',
    );
  });

  base(
    'reviewer sees plagiarism panel on their assigned submission',
    async ({ page }) => {
      if (!reviewSlug) {
        base.skip(true, 'No under_review submission found (seed not run?)');
        return;
      }
      await page.context().addCookies(reviewerCookies);
      mockPlagiarismRoutes(page, reviewSlug, REPORT_CLEAR);

      await page.goto(`/en/submissions/${reviewSlug}`);
      await hideNextJsDevPortals(page);

      await expect(page.getByTestId('corpus-similarity-panel')).toBeVisible({
        timeout: 20_000,
      });

      await page.getByTestId('corpus-similarity-toggle').click();
      await expect(page.getByTestId('corpus-similarity-result')).toBeVisible({
        timeout: 15_000,
      });
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Opt-in: Stage 2 — web similarity UI
// ═══════════════════════════════════════════════════════════════════════════

base.describe('Plagiarism check — Stage 2 web similarity', () => {
  base.setTimeout(90_000);

  let editorCookies: CookieList = [];
  let queueSlug = '';

  base.beforeAll(async () => {
    if (!RUN_OPT_IN) return;

    const editorSession = await cookieLoginAs(EDITOR_CREDS);
    editorCookies = editorSession.cookies;
    const editorToken = editorSession.token;

    const submissions = await withApiContext(async (api) => {
      const res = await api.get(apiV1Absolute('submissions'), {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      if (!res.ok()) return [] as Array<{ slug: string; status: string }>;
      return res.json() as Promise<Array<{ slug: string; status: string }>>;
    });

    queueSlug =
      submissions.find((s) => s.status === 'submitted')?.slug ??
      submissions[0]?.slug ??
      '';
  });

  base.beforeEach(() => {
    base.skip(
      !RUN_OPT_IN,
      'Set E2E_PLAGIARISM_OPT_IN=1 with seeded backend (npm run seed)',
    );
  });

  base(
    'web section shows URL link, similarity badge, and snippets',
    async ({ page }) => {
      if (!queueSlug) {
        base.skip(true, 'No non-draft submission found in editor queue');
        return;
      }
      await page.context().addCookies(editorCookies);
      mockPlagiarismRoutes(page, queueSlug, REPORT_WITH_WEB_MATCHES);

      await page.goto(`/en/submissions/${queueSlug}`);
      await hideNextJsDevPortals(page);

      await page.getByTestId('corpus-similarity-toggle').click();
      await expect(page.getByTestId('corpus-similarity-result')).toBeVisible({
        timeout: 15_000,
      });

      const webSection = page.getByTestId('corpus-similarity-web-section');
      await expect(webSection).toBeVisible();

      // URL rendered as an external link
      const sourceLink = webSection.getByRole('link', {
        name: 'https://example-arabic-journal.org/article/economics',
      });
      await expect(sourceLink).toBeVisible();
      await expect(sourceLink).toHaveAttribute(
        'href',
        'https://example-arabic-journal.org/article/economics',
      );
      await expect(sourceLink).toHaveAttribute('target', '_blank');

      // 82% ≥ threshold 70 → red badge
      await expect(webSection).toContainText('82%');

      // Arabic snippets rendered
      await expect(webSection).toContainText(
        'تأثير سياسات الوصول المفتوح على نشر المعرفة',
      );
      await expect(webSection).toContainText(
        'تأثير سياسات الوصول المفتوح في نشر البحوث العلمية',
      );
    },
  );

  base('web stage null shows "not configured" message', async ({ page }) => {
    if (!queueSlug) {
      base.skip(true, 'No non-draft submission found in editor queue');
      return;
    }
    await page.context().addCookies(editorCookies);
    mockPlagiarismRoutes(page, queueSlug, REPORT_WEB_NULL);

    await page.goto(`/en/submissions/${queueSlug}`);
    await hideNextJsDevPortals(page);

    await page.getByTestId('corpus-similarity-toggle').click();
    await expect(page.getByTestId('corpus-similarity-result')).toBeVisible({
      timeout: 15_000,
    });

    await expect(
      page.getByTestId('corpus-similarity-web-not-configured'),
    ).toBeVisible();
    await expect(page.getByTestId('corpus-similarity-web-section')).toHaveCount(
      0,
    );
  });

  base('web stage error shows amber error banner', async ({ page }) => {
    if (!queueSlug) {
      base.skip(true, 'No non-draft submission found in editor queue');
      return;
    }
    await page.context().addCookies(editorCookies);
    mockPlagiarismRoutes(page, queueSlug, REPORT_WEB_ERROR);

    await page.goto(`/en/submissions/${queueSlug}`);
    await hideNextJsDevPortals(page);

    await page.getByTestId('corpus-similarity-toggle').click();
    await expect(page.getByTestId('corpus-similarity-result')).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByTestId('corpus-similarity-web-error')).toBeVisible();
    // Section still renders (shows title + error banner, no sources)
    await expect(
      page.getByTestId('corpus-similarity-web-section'),
    ).toBeVisible();
  });
});
