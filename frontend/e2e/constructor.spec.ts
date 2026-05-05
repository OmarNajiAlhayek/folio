import { test, expect } from "./fixtures/auth";
import type { APIRequestContext } from "@playwright/test";
import { createSubmission, getApiV1Base } from "./helpers/e2e-api";
import { waitForAutosave } from "./helpers/waits";
import { mockedValidationErrors } from "./fixtures/validation-errors";

const DRAFT_STORAGE_KEY = "folio.constructor-draft.v1";

async function patchConstructorContent(
  request: APIRequestContext,
  token: string,
  slug: string,
  constructorContent: unknown,
) {
  const res = await request.patch(`${getApiV1Base()}/submissions/${slug}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { constructorContent },
  });
  expect(res.ok()).toBeTruthy();
}

test("mode routing and sticky upload mode", async ({ page }) => {
  await page.goto("/en/submissions/new");

  await page.getByTestId("constructor-mode-builder").click();
  await expect(page).toHaveURL(/\/en\/submissions\/constructor\/new$/);

  await page.goto("/en/submissions/new");
  await page.getByTestId("constructor-mode-upload").click();
  await expect(page).toHaveURL(/\/en\/submissions\/new\?mode=upload$/);
  await page.reload();
  await expect(page.getByTestId("constructor-mode-builder")).toHaveCount(0);
});

test("legacy compose/create redirects to constructor/new", async ({ page }) => {
  await page.goto("/en/submissions/compose/create");
  await expect(page).toHaveURL(/\/en\/submissions\/constructor\/new$/);
});

test("pre-slug to post-slug transition clears local draft and persists", async ({
  page,
}) => {
  await page.goto("/en/submissions/constructor/new");

  const titlePh = page.getByPlaceholder("Enter the article title…");
  await titlePh.nth(0).fill("E2E Constructor Title");
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

  await expect(
    page.locator('input[value="E2E Constructor Title"]'),
  ).toBeVisible();

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
  await page.goto(`/en/submissions/${slug}/constructor`);

  const titleInput = page.getByPlaceholder("Enter the article title…").first();
  await expect(titleInput).toHaveValue("E2E Constructor Title");
  await titleInput.fill("E2E Constructor Title Persisted");
  await waitForAutosave(page);
  await page.reload();
  await expect(titleInput).toHaveValue("E2E Constructor Title Persisted");

  await page.goto(`/en/submissions/${slug}/compose`);
  await expect(page).toHaveURL(`**/en/submissions/${slug}/constructor`);
});

test("inline gating on submission detail (mode selector vs constructor CTA)", async ({
  page,
  authToken,
}) => {
  const noMode = await createSubmission(page.request, authToken, {
    title: "No mode committed",
    abstract: "No mode abstract",
  });
  await page.goto(`/en/submissions/${noMode.slug}`);
  await expect(page.getByTestId("constructor-mode-builder")).toBeVisible();

  const constructorCommitted = await createSubmission(page.request, authToken, {
    title: "Constructor committed",
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
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("validation banner renders structured backend errors and jump works", async ({
  page,
  authToken,
}) => {
  const created = await createSubmission(page.request, authToken, {
    title: "Validation e2e",
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

  await page.goto(`/en/submissions/${created.slug}/constructor`);
  await page.route(
    `${getApiV1Base()}/submissions/${created.slug}/submit`,
    async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify(mockedValidationErrors),
      });
    },
  );

  await page.getByTestId("constructor-submit").click();
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
    title: "DOCX e2e",
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

  await page.goto(`/en/submissions/${created.slug}/constructor`);

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
