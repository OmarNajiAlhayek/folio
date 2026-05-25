import { describe, expect, it } from "vitest";
import {
  buildPresetSections,
  presetsForArticleType,
} from "@/lib/constructor-section-presets";

describe("buildPresetSections", () => {
  it("returns heading1 + paragraph with presetSourceId", () => {
    const sections = buildPresetSections("introduction", "Introduction");
    expect(sections).toHaveLength(2);
    expect(sections[0].kind).toBe("heading1");
    expect(sections[1].kind).toBe("paragraph");
    expect(sections[0].presetSourceId).toBe("introduction");
    expect(sections[1].presetSourceId).toBe("introduction");
    expect((sections[0] as { text: string }).text).toBe("Introduction");
    expect(sections[0].id).not.toBe(sections[1].id);
  });

  it("assigns unique ids per bundle", () => {
    const a = buildPresetSections("conclusions", "Conclusions");
    const b = buildPresetSections("conclusions", "Conclusions");
    expect(a[0].id).not.toBe(b[0].id);
  });
});

describe("presetsForArticleType", () => {
  it("offers full IMRaD for original research and other", () => {
    expect(presetsForArticleType("original_research")).toHaveLength(5);
    expect(presetsForArticleType("other")).toHaveLength(5);
    expect(presetsForArticleType(null)).toHaveLength(5);
  });

  it("omits materialsAndMethods for review articles", () => {
    const ids = presetsForArticleType("review_article");
    expect(ids).not.toContain("materialsAndMethods");
    expect(ids).toContain("literatureReview");
  });
});
