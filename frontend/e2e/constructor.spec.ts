import { test, expect } from "./fixtures/auth";
import type { APIRequestContext } from "@playwright/test";
import { createSubmission, apiV1Absolute, uniqueSubmissionTitle } from "./helpers/e2e-api";
import { hideNextJsDevPortals } from "./helpers/hide-next-dev-portals";
import { waitForAutosave } from "./helpers/waits";
import { mockedValidationErrors } from "./fixtures/validation-errors";

test.setTimeout(60_000);

const DRAFT_STORAGE_KEY = "folio.constructor-draft.v1";

async function patchConstructorContent(
  request: APIRequestContext,
  token: string,
  slug: string,
  constructorContent: unknown,
) {
  const res = await request.patch(
    apiV1Absolute(`submissions/${encodeURIComponent(slug)}`),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { constructorContent },
    },
  );
  expect(res.ok()).toBeTruthy();
}

test("mode routing and sticky upload mode", async ({ page }) => {
  await page.goto("/en/submissions/new");

  await page.getByTestId("constructor-mode-builder").click();
  await expect(page).toHaveURL(/\/en\/submissions\/compose\/create$/);

  await page.goto("/en/submissions/new");
  await page.getByTestId("constructor-mode-upload").click();
  await expect(page).toHaveURL(/\/en\/submissions\/new\?mode=upload$/);
  await page.reload();
  await expect(page.getByTestId("constructor-mode-builder")).toHaveCount(0);
});

test("legacy constructor/create redirects to compose/create", async ({ page }) => {
  await page.goto("/en/submissions/constructor/create");
  await expect(page).toHaveURL(/\/en\/submissions\/compose\/create$/);
});

test("pre-slug to post-slug transition clears local draft and persists", async ({
  page,
}) => {
  const titleEn = uniqueSubmissionTitle("E2E Constructor");
  await page.goto("/en/submissions/compose/create");
  await hideNextJsDevPortals(page);
  await new Promise((r) => setTimeout(r, 400));
  await hideNextJsDevPortals(page);
  await expect(page.getByPlaceholder("Enter the article title…").first()).toBeVisible({
    timeout: 45_000,
  });

  const titlePh = page.getByPlaceholder("Enter the article title…");
  await titlePh.nth(0).fill(titleEn);
  await titlePh.nth(1).fill("عنوان E2E");

  const absPh = page.getByPlaceholder("Write the abstract here…");
  await absPh.nth(0).fill("English abstract for e2e draft save.");
  await absPh.nth(1).fill("ملخص عربي للاختبار.");

  await expect
    .poll(async () => {
      return page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY);
    })
    .not.toBeNull();

  await page.getByTestId("constructor-continue-submission").click();
  await expect(page).toHaveURL(/\/en\/submissions\/new$/);

  await expect(page.getByDisplayValue(titleEn)).toBeVisible();

  await page.getByLabel("Full name").fill("E2E Author");
  await page.getByLabel("Affiliation").first().fill("E2E University");
  await page.getByLabel("Article type").selectOption("short_communication");
  await page
    .getByRole("checkbox", {
      name: /I confirm this work is original/i,
    })
    .check();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/en\/submissions\/[^/]+$/);

  await expect(
    await page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY),
  ).toBeNull();

  const slug = new URL(page.url()).pathname.split("/").filter(Boolean).pop();
  expect(slug).toBeTruthy();
  await page.goto(`/en/submissions/${slug}/compose`);

  const titleInput = page.getByPlaceholder("Enter the article title…").first();
  await expect(titleInput).toHaveValue(titleEn);
  const persisted = `${titleEn} persisted`;
  await titleInput.fill(persisted);
  await waitForAutosave(page);
  await page.reload();
  await expect(titleInput).toHaveValue(persisted);

  await page.goto(`/en/submissions/${slug}/constructor`);
  await expect(page).toHaveURL(`**/en/submissions/${slug}/compose`);
});

test("inline gating on submission detail (mode selector vs constructor CTA)", async ({
  page,
  authToken,
}) => {
  const noMode = await createSubmission(page.request, authToken, {
    title: uniqueSubmissionTitle("No mode committed"),
    abstract: "No mode abstract",
  });
  await page.goto(`/en/submissions/${noMode.slug}`);
  await expect(page.getByTestId("constructor-mode-builder")).toBeVisible();

  const constructorCommitted = await createSubmission(page.request, authToken, {
    title: uniqueSubmissionTitle("Constructor committed"),
    abstract: "Constructor abstract",
  });
  await patchConstructorContent(page.request, authToken, constructorCommitted.slug, {
    defaultDir: "ltr",
    sections: [
      {
        id: "sec-title",
        kind: "title",
        text: "Committed title",
        dir: "ltr",
        dirSource: "manual",
      },
    ],
  });

  await page.goto(`/en/submissions/${constructorCommitted.slug}`);
  await expect(
    page.getByRole("link", { name: "Open constructor" }),
  ).toBeVisible();
  await expect(page.getByTestId("constructor-mode-builder")).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(2);
});

test("validation banner renders structured backend errors and jump works", async ({
  page,
  authToken,
}) => {
  const created = await createSubmission(page.request, authToken, {
    title: uniqueSubmissionTitle("Validation e2e"),
    abstract: "Validation e2e abstract",
  });

  await patchConstructorContent(page.request, authToken, created.slug, {
    defaultDir: "ltr",
    sections: [
      {
        id: "sec-para",
        kind: "paragraph",
        html: "<p>Paragraph body</p>",
        dir: "ltr",
        dirSource: "manual",
      },
    ],
  });

  await page.goto(`/en/submissions/${created.slug}`);
  await hideNextJsDevPortals(page);
  const slugEnc = encodeURIComponent(created.slug);
  await page.route(
    `**${apiV1Absolute(`submissions/${slugEnc}/generate-docx`)}**`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-manuscript",
          originalName: "e2e.docx",
          kind: "manuscript",
        }),
      });
    },
  );
  await page.route(
    `${apiV1Absolute(`submissions/${slugEnc}/submit`)}`,
    async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify(mockedValidationErrors),
      });
    },
  );

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/en/submissions/${created.slug}/compose$`),
  );
  await expect(page.getByTestId("constructor-validation-banner")).toBeVisible();

  const jumpButton = page.getByTestId("constructor-validation-jump-sec-para");
  await expect(jumpButton).toBeVisible();
  await jumpButton.click();

  const targetSection = page.locator("#constructor-section-sec-para");
  await expect(targetSection).toBeInViewport();
  await expect(
    page.locator('#constructor-section-sec-para [contenteditable="true"]'),
  ).toBeFocused();
});

test("docx generate flow (real smoke + rtl preview assertion)", async ({
  page,
  authToken,
}) => {
  const created = await createSubmission(page.request, authToken, {
    title: uniqueSubmissionTitle("DOCX e2e"),
    abstract: "DOCX e2e abstract",
  });

  await patchConstructorContent(page.request, authToken, created.slug, {
    defaultDir: "ltr",
    sections: [
      {
        id: "sec-title",
        kind: "title",
        text: "Docx title",
        dir: "ltr",
        dirSource: "manual",
      },
      {
        id: "sec-abs",
        kind: "abstract",
        lang: "en",
        text: "English abstract for docx.",
        keywords: "docx, e2e",
      },
      {
        id: "sec-abs-ar",
        kind: "abstract",
        lang: "ar",
        text: "ملخص عربي للاختبار",
        keywords: "اختبار",
      },
      {
        id: "sec-ref",
        kind: "references",
        items: [{ lang: "en", text: "Smith, 2024" }],
      },
      {
        id: "sec-rtl",
        kind: "paragraph",
        html: "<p></p>",
        dir: "ltr",
        dirSource: "auto",
      },
    ],
  });

  await page.goto(`/en/submissions/${created.slug}/compose`);
  await hideNextJsDevPortals(page);

  const paragraphEditor = page.locator(
    '#constructor-section-sec-rtl [contenteditable="true"]',
  );
  await paragraphEditor.click();
  await paragraphEditor.fill("هذا نص عربي لاختبار اتجاه الفقرة");
  await waitForAutosave(page);

  await expect(
    page.locator(
      '[data-testid="constructor-preview-section-sec-rtl"] [dir="rtl"]',
    ),
  ).toBeVisible();

  const responsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === "POST" &&
      response.url().includes(`/api/v1/submissions/${created.slug}/generate-docx`) &&
      response.status() === 200
    );
  });
  await page.getByTestId("constructor-generate-docx").click();
  const response = await responsePromise;
  const mime = response.headers()["content-type"] ?? "";
  expect(mime).toContain(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  const body = await response.body();
  expect(body.byteLength).toBeGreaterThan(5 * 1024);
});

test("generate-docx POST body includes unsaved paragraph text (before autosave)", async ({
  page,
  authToken,
}) => {
  const created = await createSubmission(page.request, authToken, {
    title: uniqueSubmissionTitle("DOCX unsaved body"),
    abstract: "abstract",
  });

  await patchConstructorContent(page.request, authToken, created.slug, {
    defaultDir: "ltr",
    sections: [
      {
        id: "sec-title",
        kind: "title",
        text: "Title",
      },
      {
        id: "sec-abs",
        kind: "abstract",
        lang: "en",
        text: "English abstract.",
        keywords: "k",
      },
      {
        id: "sec-abs-ar",
        kind: "abstract",
        lang: "ar",
        text: "ملخص",
        keywords: "ك",
      },
      {
        id: "sec-p",
        kind: "paragraph",
        html: "<p></p>",
      },
      {
        id: "sec-ref",
        kind: "references",
        items: [{ lang: "en", text: "Ref" }],
      },
    ],
  });

  await page.goto(`/en/submissions/${created.slug}/compose`);
  await hideNextJsDevPortals(page);

  const marker = "UNSAVED_DOCX_MARKER_E2E_XYZ";
  const paragraphEditor = page.locator(
    '#constructor-section-sec-p [contenteditable="true"]',
  );
  await paragraphEditor.click();
  await paragraphEditor.fill(marker);

  const requestPromise = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      req.url().includes(
        `/api/v1/submissions/${encodeURIComponent(created.slug)}/generate-docx`,
      ),
  );

  await page.getByTestId("constructor-generate-docx").click();
  const req = await requestPromise;
  const data = req.postDataJSON() as { content?: { sections?: unknown[] } };
  const sections = data.content?.sections ?? [];
  const para = sections.find(
    (s): s is { kind: string; html?: string } =>
      typeof s === "object" && s !== null && (s as { kind?: string }).kind === "paragraph",
  );
  expect(para?.html).toContain(marker);
});
