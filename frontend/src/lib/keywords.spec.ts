import {
  addAllSuggestedKeywords,
  addSuggestedKeyword,
  mergeKeywordTags,
  pendingKeywordSuggestions,
} from "./keywords";

describe("pendingKeywordSuggestions", () => {
  it("drops English terms already present (case-insensitive)", () => {
    expect(
      pendingKeywordSuggestions(
        ["SAMPLE", "new term"],
        ["sample", "methods"],
        "en",
      ),
    ).toEqual(["new term"]);
  });

  it("returns empty when at max tags", () => {
    expect(
      pendingKeywordSuggestions(
        ["extra"],
        ["a", "b", "c", "d", "e", "f"],
        "en",
      ),
    ).toEqual([]);
  });
});

describe("mergeKeywordTags", () => {
  it("merges without duplicate English casing", () => {
    expect(mergeKeywordTags(["sample"], ["SAMPLE", "methods"], "en")).toEqual([
      "sample",
      "methods",
    ]);
  });

  it("stops at six keywords", () => {
    expect(
      mergeKeywordTags(
        ["a", "b", "c", "d", "e"],
        ["f", "g"],
        "en",
      ),
    ).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("addSuggestedKeyword", () => {
  it("reports duplicate for English casing", () => {
    expect(addSuggestedKeyword(["sample"], "SAMPLE", "en")).toEqual({
      tags: ["sample"],
      addedCount: 0,
      failure: "duplicate",
    });
  });

  it("reports max when full", () => {
    const full = ["a", "b", "c", "d", "e", "f"];
    expect(addSuggestedKeyword(full, "g", "en")).toEqual({
      tags: full,
      addedCount: 0,
      failure: "max",
    });
  });

  it("respects custom maxTags above default six", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"];
    expect(addSuggestedKeyword(seven, "h", "en", 50)).toEqual({
      tags: [...seven, "h"],
      addedCount: 1,
    });
  });
});

describe("addAllSuggestedKeywords", () => {
  it("reports max when list is full", () => {
    const full = ["a", "b", "c", "d", "e", "f"];
    expect(addAllSuggestedKeywords(full, ["g"], "en")).toEqual({
      tags: full,
      addedCount: 0,
      failure: "max",
    });
  });
});
