"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "@/lib/api";
import {
  fetchManuscriptStyleCatalog,
  type ManuscriptConstructorGuidance,
  type ManuscriptStyleCatalog,
} from "@/lib/manuscript-styles-catalog";
import type {
  ConstructorContent,
  ConstructorGuidance,
} from "@/lib/constructor-content.types";

export function guidanceFromCatalogEntry(
  entry: { constructorGuidance?: ManuscriptConstructorGuidance } | undefined,
): ConstructorGuidance | null {
  if (!entry?.constructorGuidance) return null;
  const g = entry.constructorGuidance;
  return {
    extraMandatorySlots: g.extraMandatorySlots,
    recommendedPresets: g.recommendedPresets,
    requiredRichTextKinds: g.requiredRichTextKinds,
  };
}

export type UseConstructorStyleGuidanceOptions = {
  /** Dev/catalog preview override (`?previewStyleId=` on compose pages). */
  previewStyleId?: string;
};

/**
 * Resolves manuscript-style catalog + constructor guidance for the active
 * style (content.manuscriptStyleId, catalog default, or preview override).
 */
export function useConstructorStyleGuidance(
  content: ConstructorContent,
  options?: UseConstructorStyleGuidanceOptions,
) {
  const [catalog, setCatalog] = useState<ManuscriptStyleCatalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchManuscriptStyleCatalog(getApiBase());
      if (cancelled) return;
      if (!result.ok) {
        setCatalogFailed(true);
        return;
      }
      setCatalog(result.data);
      setCatalogFailed(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewStyleOverride = options?.previewStyleId?.trim() ?? "";

  const effectiveStyleId =
    previewStyleOverride ||
    content.manuscriptStyleId?.trim() ||
    catalog?.defaultStyleId ||
    "";

  const catalogEntry = useMemo(
    () => catalog?.styles.find((s) => s.id === effectiveStyleId),
    [catalog, effectiveStyleId],
  );

  const guidance = useMemo(
    () => guidanceFromCatalogEntry(catalogEntry),
    [catalogEntry],
  );

  return {
    catalog,
    catalogFailed,
    catalogEntry,
    effectiveStyleId,
    guidance,
  };
}
