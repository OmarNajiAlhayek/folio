import type { ReviewAssignment } from '../entities/review-assignment.entity';
import type { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import type { ReviewDiscussion } from '../entities/review-discussion.entity';
import { toUserIdentity, toUserSummary } from '../users/user-summary';

/**
 * JSON shapes for assignment rows returned to editorial staff.
 *
 * These exist because the repository loads `reviewer` / `copyeditor` / `author`
 * as full `User` entities. Returning those rows directly ships `passwordHash`
 * and every other user column to the client, so every handler maps through here.
 */

export function reviewAssignmentToEditorJson(
  a: ReviewAssignment,
): Record<string, unknown> {
  return {
    id: a.id,
    slug: a.slug,
    submissionId: a.submissionId,
    reviewerId: a.reviewerId,
    status: a.status,
    assignedAt: a.assignedAt,
    respondedAt: a.respondedAt ?? null,
    responseDueAt: a.responseDueAt ?? null,
    reviewDueAt: a.reviewDueAt ?? null,
    editorInstructions: a.editorInstructions ?? '',
    assignedById: a.assignedById ?? null,
    reviewer: toUserSummary(a.reviewer),
    assignedBy: toUserSummary(a.assignedBy),
    ...(a.review
      ? {
          review: {
            id: a.review.id,
            recommendation: a.review.recommendation,
            submittedAt: a.review.submittedAt,
          },
        }
      : {}),
  };
}

export function copyeditAssignmentToEditorJson(
  a: CopyeditAssignment,
): Record<string, unknown> {
  return {
    id: a.id,
    slug: a.slug,
    submissionId: a.submissionId,
    copyeditorId: a.copyeditorId,
    status: a.status,
    assignedAt: a.assignedAt,
    copyeditor: toUserSummary(a.copyeditor),
    ...(a.notes
      ? {
          notes: a.notes.map((n) => ({
            id: n.id,
            assignmentId: n.assignmentId,
            round: n.round,
            noteForAuthor: n.noteForAuthor,
            noteToEditorOnly: n.noteToEditorOnly,
            submittedAt: n.submittedAt,
          })),
        }
      : {}),
  };
}

/**
 * Discussion threads on a review assignment. Message authors are reduced to
 * `{ id, displayName }` — an editor's email is not part of this conversation,
 * and the reviewer must never receive a `User` row.
 */
export function reviewDiscussionToJson(
  d: ReviewDiscussion,
): Record<string, unknown> {
  return {
    id: d.id,
    assignmentId: d.assignmentId,
    subject: d.subject,
    createdAt: d.createdAt,
    messages: (d.messages ?? []).map((m) => ({
      id: m.id,
      discussionId: m.discussionId,
      body: m.body,
      createdAt: m.createdAt,
      authorId: m.authorId,
      author: toUserIdentity(m.author),
    })),
  };
}
