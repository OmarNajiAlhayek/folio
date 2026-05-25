import { describe, expect, it } from "vitest";
import {
  constructorDraftHasSections,
  resolveConstructorDocxFileName,
} from "./constructor-docx-filename";

describe("resolveConstructorDocxFileName", () => {
  it("uses Arabic title for the display name", () => {
    const name = resolveConstructorDocxFileName({
      defaultDir: "ltr",
      sections: [
        { kind: "title", lang: "en", text: "English title" },
        { kind: "title", lang: "ar", text: "عنوان عربي" },
      ],
    });
    expect(name).toBe("عنوان عربي.docx");
  });

  it("falls back when no Arabic title", () => {
    const name = resolveConstructorDocxFileName({
      defaultDir: "ltr",
      sections: [{ kind: "title", lang: "en", text: "Only EN" }],
    });
    expect(name).toMatch(/\.docx$/);
  });
});

describe("constructorDraftHasSections", () => {
  it("is false for empty or missing sections", () => {
    expect(constructorDraftHasSections(null)).toBe(false);
    expect(constructorDraftHasSections({ defaultDir: "ltr", sections: [] })).toBe(
      false,
    );
  });

  it("is true when sections exist", () => {
    expect(
      constructorDraftHasSections({
        defaultDir: "ltr",
        sections: [{ kind: "title", lang: "en", text: "T" }],
      }),
    ).toBe(true);
  });
});
