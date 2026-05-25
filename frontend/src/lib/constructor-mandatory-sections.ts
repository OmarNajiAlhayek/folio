import type {
  ConstructorContent,
  ConstructorDir,
  ConstructorSection,
  ConstructorGuidance,
  RichTextBlockKind,
} from "./constructor-content.types";

export type MandatorySlot =
  | "title-en"
  | "title-ar"
  | "authors"
  | "abstract-en"
  | "abstract-ar"
  | "references";

export type BackMatterMandatorySlot = RichTextBlockKind;

const FRONT_MANDATORY: MandatorySlot[] = [
  "title-en",
  "title-ar",
  "authors",
  "abstract-en",
  "abstract-ar",
];
const BACK_MANDATORY: MandatorySlot[] = ["references"];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function matchesSlot(section: ConstructorSection, slot: MandatorySlot): boolean {
  switch (slot) {
    case "title-en":
      return (
        section.kind === "title" &&
        ((section as { lang?: string }).lang === "en" ||
          !(section as { lang?: string }).lang)
      );
    case "title-ar":
      return section.kind === "title" && (section as { lang?: string }).lang === "ar";
    case "authors":
      return section.kind === "authors";
    case "abstract-en":
      return section.kind === "abstract" && section.lang === "en";
    case "abstract-ar":
      return section.kind === "abstract" && section.lang === "ar";
    case "references":
      return section.kind === "references";
  }
}

function createMandatorySection(slot: MandatorySlot): ConstructorSection {
  const id = newId();
  const base = {
    id,
    pinned: true,
    dirSource: "auto" as const,
  };
  switch (slot) {
    case "title-en":
      return {
        ...base,
        kind: "title",
        lang: "en",
        text: "",
        dir: "ltr" satisfies ConstructorDir,
      };
    case "title-ar":
      return {
        ...base,
        kind: "title",
        lang: "ar",
        text: "",
        dir: "rtl",
      };
    case "authors":
      return { ...base, kind: "authors", authors: [], dir: "ltr" };
    case "abstract-en":
      return {
        ...base,
        kind: "abstract",
        lang: "en",
        text: "",
        keywords: "",
        dir: "ltr",
      };
    case "abstract-ar":
      return {
        ...base,
        kind: "abstract",
        lang: "ar",
        text: "",
        keywords: "",
        dir: "rtl",
      };
    case "references":
      return { ...base, kind: "references", items: [], dir: "ltr" };
  }
}

function createBackMatterMandatorySection(
  slot: BackMatterMandatorySlot,
): ConstructorSection {
  return {
    id: newId(),
    kind: slot,
    html: "<p></p>",
    dir: "ltr",
    dirSource: "auto",
    pinned: true,
  };
}

/**
 * Every Word-constructor document includes six mandatory sections (bilingual
 * titles, authors, bilingual abstracts, references). Profile `extraMandatorySlots`
 * insert pinned back-matter sections immediately before references.
 */
export function ensureMandatoryConstructorSections(
  content: ConstructorContent,
  guidance?: ConstructorGuidance | null,
): ConstructorContent {
  const backMatterSlots = guidance?.extraMandatorySlots ?? [];
  const present = new Set<MandatorySlot>();
  const presentBackMatter = new Set<BackMatterMandatorySlot>();

  let sections = content.sections.map((section) => {
    for (const slot of [...FRONT_MANDATORY, ...BACK_MANDATORY]) {
      if (!present.has(slot) && matchesSlot(section, slot)) {
        present.add(slot);
        return { ...section, pinned: true };
      }
    }
    for (const slot of backMatterSlots) {
      if (!presentBackMatter.has(slot) && section.kind === slot) {
        presentBackMatter.add(slot);
        return { ...section, pinned: true };
      }
    }
    return section;
  });

  const missingFront = FRONT_MANDATORY.filter((slot) => !present.has(slot));
  const missingBackMatter = backMatterSlots.filter(
    (slot) => !presentBackMatter.has(slot),
  );
  const missingRefs = BACK_MANDATORY.filter((slot) => !present.has(slot));

  if (
    missingFront.length === 0 &&
    missingBackMatter.length === 0 &&
    missingRefs.length === 0
  ) {
    return { ...content, sections };
  }

  sections = [
    ...missingFront.map(createMandatorySection),
    ...sections,
  ];

  if (missingBackMatter.length > 0) {
    const refsIdx = sections.findIndex((s) => s.kind === "references");
    const inserted = missingBackMatter.map(createBackMatterMandatorySection);
    if (refsIdx >= 0) {
      sections = [
        ...sections.slice(0, refsIdx),
        ...inserted,
        ...sections.slice(refsIdx),
      ];
    } else {
      sections = [...sections, ...inserted];
    }
  }

  if (missingRefs.length > 0) {
    sections = [...sections, ...missingRefs.map(createMandatorySection)];
  }

  return {
    ...content,
    defaultDir: content.defaultDir ?? "ltr",
    sections,
  };
}

/** Fresh constructor document with all mandatory sections pre-created. */
export function createEmptyConstructorContent(
  guidance?: ConstructorGuidance | null,
): ConstructorContent {
  return ensureMandatoryConstructorSections(
    { defaultDir: "ltr", sections: [] },
    guidance,
  );
}
