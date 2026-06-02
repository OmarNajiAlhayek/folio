import { describe, expect, it } from "vitest";
import { localizeConstructorValidationErrors } from "./constructor-validation";

describe("localizeConstructorValidationErrors", () => {
  it("replaces backend English messages using error codes", () => {
    const localized = localizeConstructorValidationErrors(
      [
        {
          code: "CONSTRUCTOR_REFERENCES_EMPTY",
          message: "The references section must contain at least one entry",
          sectionId: "refs-1",
        },
      ],
      (code) =>
        code === "CONSTRUCTOR_REFERENCES_EMPTY"
          ? "أضف مرجعًا واحدًا على الأقل."
          : null,
    );

    expect(localized[0]?.message).toBe("أضف مرجعًا واحدًا على الأقل.");
    expect(localized[0]?.sectionId).toBe("refs-1");
  });
});
