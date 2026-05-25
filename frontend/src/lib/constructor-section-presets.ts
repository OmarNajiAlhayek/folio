import type {
  ConstructorPresetId,
  ConstructorSection,
} from "@/lib/constructor-content.types";

export type { ConstructorPresetId };

export type SubmissionArticleType =
  | "original_research"
  | "review_article"
  | "case_report"
  | "short_communication"
  | "other";

const ALL_PRESET_IDS: ConstructorPresetId[] = [
  "introduction",
  "literatureReview",
  "materialsAndMethods",
  "resultsAndDiscussion",
  "conclusions",
];

const REVIEW_PRESETS: ConstructorPresetId[] = [
  "introduction",
  "literatureReview",
  "resultsAndDiscussion",
  "conclusions",
];

const CASE_SHORT_PRESETS: ConstructorPresetId[] = [
  "introduction",
  "materialsAndMethods",
  "resultsAndDiscussion",
  "conclusions",
];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type PresetHeadingKey =
  | "preset_introduction"
  | "preset_literatureReview"
  | "preset_materialsAndMethods"
  | "preset_resultsAndDiscussion"
  | "preset_conclusions";

const PRESET_HEADING_KEYS: Record<ConstructorPresetId, PresetHeadingKey> = {
  introduction: "preset_introduction",
  literatureReview: "preset_literatureReview",
  materialsAndMethods: "preset_materialsAndMethods",
  resultsAndDiscussion: "preset_resultsAndDiscussion",
  conclusions: "preset_conclusions",
};

/**
 * Returns one heading1 + one empty paragraph, both tagged with `presetSourceId`.
 * Heading text is resolved at insert time via `t` (plain strings stored in JSON).
 */
export function buildPresetSections(
  id: ConstructorPresetId,
  headingText: string,
  defaultDir: "ltr" | "rtl" = "ltr",
): ConstructorSection[] {
  const sectionId = newId();
  const paragraphId = newId();
  return [
    {
      id: sectionId,
      kind: "heading1",
      text: headingText,
      dir: defaultDir,
      dirSource: "auto",
      presetSourceId: id,
    },
    {
      id: paragraphId,
      kind: "paragraph",
      html: "<p></p>",
      dir: defaultDir,
      dirSource: "auto",
      presetSourceId: id,
    },
  ];
}

export function presetHeadingKey(id: ConstructorPresetId): PresetHeadingKey {
  return PRESET_HEADING_KEYS[id];
}

/** IMRaD presets offered in the add picker for the given article type. */
export function presetsForArticleType(
  articleType: SubmissionArticleType | null | undefined,
): ConstructorPresetId[] {
  switch (articleType) {
    case "review_article":
      return REVIEW_PRESETS;
    case "case_report":
    case "short_communication":
      return CASE_SHORT_PRESETS;
    case "original_research":
    case "other":
    default:
      return ALL_PRESET_IDS;
  }
}
