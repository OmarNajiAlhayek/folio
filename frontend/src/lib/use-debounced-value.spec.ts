import { describe, expect, it } from "vitest";
import { PUBLICATION_CATALOG_QUICK_SEARCH_DEBOUNCE_MS } from "./use-debounced-value";

describe("use-debounced-value", () => {
  it("exports 500ms catalog quick-search debounce", () => {
    expect(PUBLICATION_CATALOG_QUICK_SEARCH_DEBOUNCE_MS).toBe(500);
  });
});
