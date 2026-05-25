import type {
  ConstructorContent,
  ConstructorGuidance,
  ConstructorSection,
} from "@/lib/constructor-content.types";
import {
  ensureMandatoryConstructorSections,
  type MandatorySlot,
} from "@/lib/constructor-mandatory-sections";

const FRONT_SLOTS = [
  "title-en",
  "title-ar",
  "authors",
  "abstract-en",
  "abstract-ar",
] as const satisfies readonly MandatorySlot[];

const BACK_SLOTS = ["references"] as const satisfies readonly MandatorySlot[];

function matchesSlot(
  section: ConstructorSection,
  slot: MandatorySlot,
): boolean {
  switch (slot) {
    case "title-en":
      return (
        section.kind === "title" &&
        ((section as { lang?: string }).lang === "en" ||
          !(section as { lang?: string }).lang)
      );
    case "title-ar":
      return (
        section.kind === "title" && (section as { lang?: string }).lang === "ar"
      );
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

function isBodySection(section: ConstructorSection): boolean {
  return (
    section.kind === "heading1" ||
    section.kind === "heading2" ||
    section.kind === "heading3" ||
    section.kind === "paragraph" ||
    section.kind === "image" ||
    section.kind === "table" ||
    section.kind === "acknowledgments" ||
    section.kind === "funding" ||
    section.kind === "conflictOfInterest" ||
    section.kind === "dataAvailability" ||
    section.kind === "equation"
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function sectionHasContent(section: ConstructorSection): boolean {
  switch (section.kind) {
    case "title":
    case "heading1":
    case "heading2":
    case "heading3":
      return section.text.trim().length > 0;
    case "abstract":
      return section.text.trim().length > 0 || section.keywords.trim().length > 0;
    case "paragraph":
    case "acknowledgments":
    case "funding":
    case "conflictOfInterest":
    case "dataAvailability":
      return stripHtml(section.html).length > 0;
    case "authors":
      return section.authors.some((a) => a.fullName.trim().length > 0);
    case "references":
      return section.items.some((r) => r.text.trim().length > 0);
    case "image":
      return Boolean(section.fileId) || section.caption.trim().length > 0;
    case "table":
      return (
        section.rows.some((row) => row.some((c) => c.trim().length > 0)) ||
        (section.notes?.trim().length ?? 0) > 0
      );
    case "equation":
      return section.latex.trim().length > 0;
    default:
      return false;
  }
}

function mergeMandatorySection(
  target: ConstructorSection,
  source: ConstructorSection | undefined,
): ConstructorSection {
  if (!source || !sectionHasContent(source)) return target;
  if (target.kind !== source.kind) return target;

  switch (target.kind) {
    case "title":
      return source.kind === "title" &&
        (target.lang === source.lang || (!target.lang && source.lang === "en"))
        ? { ...target, text: source.text, dir: source.dir ?? target.dir }
        : target;
    case "abstract":
      return source.kind === "abstract" && target.lang === source.lang
        ? {
            ...target,
            text: source.text,
            keywords: source.keywords || target.keywords,
            dir: source.dir ?? target.dir,
          }
        : target;
    case "authors":
      return source.kind === "authors" && source.authors.length > 0
        ? { ...target, authors: source.authors }
        : target;
    case "references":
      return source.kind === "references" && source.items.length > 0
        ? { ...target, items: source.items }
        : target;
    case "table":
      return source.kind === "table"
        ? {
            ...target,
            caption: source.caption || target.caption,
            rows: source.rows.length > 0 ? source.rows : target.rows,
            notes: source.notes || target.notes,
          }
        : target;
    default:
      return target;
  }
}

export function mergeImportedConstructorContent(
  current: ConstructorContent,
  imported: ConstructorContent,
  guidance?: ConstructorGuidance | null,
): ConstructorContent {
  const base = ensureMandatoryConstructorSections(current, guidance);
  const importedSections = imported.sections ?? [];
  const bodyFromImport = importedSections.filter(isBodySection);

  const mergedMandatory = base.sections.map((section) => {
    if (!section.pinned) return section;
    for (const slot of [...FRONT_SLOTS, ...BACK_SLOTS]) {
      if (matchesSlot(section, slot)) {
        return mergeMandatorySection(
          section,
          pickImportedForSlot(importedSections, slot),
        );
      }
    }
    return section;
  });

  const withoutBody = mergedMandatory.filter((s) => !isBodySection(s));
  const refsIdx = withoutBody.findIndex((s) => s.kind === "references");
  if (refsIdx >= 0) {
    const before = withoutBody.slice(0, refsIdx);
    const after = withoutBody.slice(refsIdx);
    return ensureMandatoryConstructorSections(
      {
        defaultDir: imported.defaultDir ?? base.defaultDir,
        manuscriptStyleId: base.manuscriptStyleId ?? imported.manuscriptStyleId,
        sections: [...before, ...bodyFromImport, ...after],
      },
      guidance,
    );
  }

  return ensureMandatoryConstructorSections(
    {
      defaultDir: imported.defaultDir ?? base.defaultDir,
      manuscriptStyleId: base.manuscriptStyleId ?? imported.manuscriptStyleId,
      sections: [...withoutBody, ...bodyFromImport],
    },
    guidance,
  );
}

function pickImportedForSlot(
  imported: ConstructorSection[],
  slot: MandatorySlot,
): ConstructorSection | undefined {
  return imported.find((s) => matchesSlot(s, slot));
}

export function constructorDraftHasMeaningfulContent(
  content: ConstructorContent,
): boolean {
  return content.sections.some((s) => {
    if (s.pinned && !sectionHasContent(s)) return false;
    return sectionHasContent(s);
  });
}
