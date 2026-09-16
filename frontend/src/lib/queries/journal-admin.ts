'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/lib/api';
import type { PublicEditorialBoardMember } from '@/lib/editorial-board';
import { queryKeys } from '@/lib/query-keys';

/** One row of `GET /journals/editable` — a journal this caller may edit. */
export type EditableJournal = {
  slug: string;
  titleAr: string;
  titleEn: string;
  issn: string | null;
  eissn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** Journal manager only. ISSNs and aims and scope are implied by the row being listed. */
  canEditTitles: boolean;
  updatedAt: string;
};

/** `PATCH /journals/:slug` body. Omitted fields are left alone; `null` clears. */
export type JournalMetadataPatch = Partial<
  Pick<
    EditableJournal,
    | 'titleAr'
    | 'titleEn'
    | 'issn'
    | 'eissn'
    | 'descriptionAr'
    | 'descriptionEn'
  >
>;

export function useEditableJournals() {
  return useQuery({
    queryKey: queryKeys.editableJournals,
    queryFn: () => apiJson<EditableJournal[]>('/journals/editable'),
  });
}

export function updateJournalMetadata(
  slug: string,
  patch: JournalMetadataPatch,
): Promise<EditableJournal> {
  return apiJson<EditableJournal>(`/journals/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Staff view of a board member: the public fields plus what editing needs. */
export type EditorialBoardMember = PublicEditorialBoardMember & {
  id: string;
  sortOrder: number;
};

/** Create or update body; on update, omitted fields are left alone. */
export type EditorialBoardMemberInput = Partial<PublicEditorialBoardMember>;

function boardPath(slug: string, rest = ''): string {
  return `/journals/${encodeURIComponent(slug)}/editorial-board${rest}`;
}

export function useEditorialBoard(slug: string) {
  return useQuery({
    queryKey: queryKeys.editorialBoard(slug),
    queryFn: () => apiJson<EditorialBoardMember[]>(boardPath(slug)),
  });
}

export function createBoardMember(
  slug: string,
  input: EditorialBoardMemberInput,
): Promise<EditorialBoardMember> {
  return apiJson<EditorialBoardMember>(boardPath(slug), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateBoardMember(
  slug: string,
  id: string,
  input: EditorialBoardMemberInput,
): Promise<EditorialBoardMember> {
  return apiJson<EditorialBoardMember>(
    boardPath(slug, `/${encodeURIComponent(id)}`),
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export function deleteBoardMember(
  slug: string,
  id: string,
): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(boardPath(slug, `/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}

/** `ids` lists every member of the board, in the new order. */
export function reorderBoard(
  slug: string,
  ids: string[],
): Promise<EditorialBoardMember[]> {
  return apiJson<EditorialBoardMember[]>(boardPath(slug, '/order'), {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  });
}
