export const mockedValidationErrors = {
  message: "Validation failed",
  code: "CONSTRUCTOR_VALIDATION_FAILED",
  errors: [
    {
      code: "CONSTRUCTOR_TITLE_MISSING",
      message: "Add a title section.",
    },
    {
      code: "CONSTRUCTOR_REFERENCES_MISSING",
      message: "Add a references section.",
      sectionId: "sec-para",
    },
  ],
} as const;
