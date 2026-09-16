/**
 * Editorial board shapes and labels, shared by the public board page (a server
 * component) and the staff editor (a client component) — so no `'use client'`.
 */

/** Board positions in public display order. Mirrors backend `EDITORIAL_BOARD_ROLES`. */
export const EDITORIAL_BOARD_ROLES = [
  'editor_in_chief',
  'deputy_editor_in_chief',
  'managing_editor',
  'member',
  'advisory_member',
] as const;

export type EditorialBoardRole = (typeof EDITORIAL_BOARD_ROLES)[number];

/** `GET /public/journals/:slug/editorial-board` — one row, in board order. */
export type PublicEditorialBoardMember = {
  nameAr: string | null;
  nameEn: string | null;
  role: EditorialBoardRole;
  affiliationAr: string | null;
  affiliationEn: string | null;
  orcid: string | null;
};

/** Public page group headings, `Journals` namespace. */
export const BOARD_GROUP_KEY = {
  editor_in_chief: 'boardGroupEditorInChief',
  deputy_editor_in_chief: 'boardGroupDeputyEditorInChief',
  managing_editor: 'boardGroupManagingEditor',
  member: 'boardGroupMember',
  advisory_member: 'boardGroupAdvisoryMember',
} as const satisfies Record<EditorialBoardRole, string>;

/** Singular role labels for staff, `JournalSettings` namespace. */
export const BOARD_ROLE_LABEL_KEY = {
  editor_in_chief: 'roleEditorInChief',
  deputy_editor_in_chief: 'roleDeputyEditorInChief',
  managing_editor: 'roleManagingEditor',
  member: 'roleMember',
  advisory_member: 'roleAdvisoryMember',
} as const satisfies Record<EditorialBoardRole, string>;

/** The name in the reader's language, falling back to the other one. */
export function boardMemberName(
  m: Pick<PublicEditorialBoardMember, 'nameAr' | 'nameEn'>,
  isAr: boolean,
): string {
  return (isAr ? (m.nameAr ?? m.nameEn) : (m.nameEn ?? m.nameAr)) ?? '';
}

/** The affiliation in the reader's language, falling back to the other one. */
export function boardMemberAffiliation(
  m: Pick<PublicEditorialBoardMember, 'affiliationAr' | 'affiliationEn'>,
  isAr: boolean,
): string | null {
  return isAr
    ? (m.affiliationAr ?? m.affiliationEn)
    : (m.affiliationEn ?? m.affiliationAr);
}
