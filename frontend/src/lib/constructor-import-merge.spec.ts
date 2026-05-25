import { describe, expect, it } from "vitest";
import { createEmptyConstructorContent } from "@/lib/constructor-mandatory-sections";
import { mergeImportedConstructorContent } from "@/lib/constructor-import-merge";
import type { ConstructorContent } from "@/lib/constructor-content.types";

describe("mergeImportedConstructorContent", () => {
  it("fills an empty English title from import", () => {
    const current = createEmptyConstructorContent();
    const imported: ConstructorContent = {
      defaultDir: "ltr",
      sections: [
        {
          id: "t1",
          kind: "title",
          lang: "en",
          text: "Imported title",
          dir: "ltr",
        },
        {
          id: "p1",
          kind: "paragraph",
          html: "<p>Body</p>",
          dir: "ltr",
        },
      ],
    };
    const merged = mergeImportedConstructorContent(current, imported);
    const enTitle = merged.sections.find(
      (s) => s.kind === "title" && (s as { lang?: string }).lang !== "ar",
    );
    expect((enTitle as { text: string }).text).toBe("Imported title");
    expect(merged.sections.some((s) => s.kind === "paragraph")).toBe(true);
  });
});
