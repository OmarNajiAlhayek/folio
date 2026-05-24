import type { ManuscriptStyleProfile } from './manuscript-style.types';

/** Build the registry map; fails fast on duplicate ids when adding more profiles. */
export function manuscriptProfilesMap(
  ...profiles: ManuscriptStyleProfile[]
): Map<string, ManuscriptStyleProfile> {
  const m = new Map<string, ManuscriptStyleProfile>();
  for (const p of profiles) {
    if (m.has(p.id)) {
      throw new Error(`Duplicate manuscript style id: ${p.id}`);
    }
    m.set(p.id, p);
  }
  return m;
}
