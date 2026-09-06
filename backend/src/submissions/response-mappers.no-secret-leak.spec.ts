import { instanceToPlain } from 'class-transformer';
import { User } from '../entities/user.entity';
import { submissionToViewerJson } from './submission-response.mapper';
import {
  copyeditAssignmentToEditorJson,
  reviewAssignmentToEditorJson,
  reviewDiscussionToJson,
} from './assignment-response.mapper';
import type { SubmissionViewerRole } from './submission-viewer-role';

/**
 * Guards the boundary that leaked `passwordHash` to every editor and section
 * editor: handlers returned TypeORM entities with a `User` relation loaded.
 *
 * Two independent layers are asserted here — the hand-written mappers, and the
 * `@Exclude()` that backs them up when something is serialized directly.
 */

const HASH = '$2b$10$exampleexampleexampleexampleexampleexampleexample';

function makeUser(over: Partial<User> = {}): User {
  const u = new User();
  Object.assign(u, {
    id: 'u-1',
    email: 'person@folio.test',
    passwordHash: HASH,
    displayName: 'Test Person',
    affiliation: null,
    orcid: null,
    reviewKeywords: null,
    willingToReview: false,
    preferredLocale: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  });
  return u;
}

/** Every string anywhere in the structure, however deeply nested. */
function serialize(value: unknown): string {
  return JSON.stringify(value);
}

describe('response mappers never emit password hashes', () => {
  const reviewer = makeUser({ id: 'u-rev', displayName: 'Dr Reviewer' });
  const author = makeUser({ id: 'u-author', displayName: 'A. Author' });
  const editor = makeUser({ id: 'u-editor', displayName: 'An Editor' });

  const assignment = {
    id: 'ra-1',
    slug: 'asg-1',
    submissionId: 's-1',
    reviewerId: reviewer.id,
    reviewer,
    assignedById: editor.id,
    assignedBy: editor,
    status: 'accepted',
    assignedAt: new Date('2026-02-01'),
    respondedAt: null,
    responseDueAt: null,
    reviewDueAt: null,
    editorInstructions: '',
    review: null,
  } as never;

  const submission = {
    id: 's-1',
    slug: 'a-paper',
    title: 'A Paper',
    files: [],
    authorId: author.id,
    author,
    reviewAssignments: [assignment],
    copyeditAssignments: [],
    sectionEditorAssignment: null,
  } as never;

  const roles: SubmissionViewerRole[] = [
    'editor',
    'section_editor',
    'author',
    'reviewer',
    'copyeditor',
  ];

  it.each(roles)('submissionToViewerJson: %s view has no hash', (role) => {
    expect(serialize(submissionToViewerJson(submission, role))).not.toContain(
      HASH,
    );
  });

  it('editor view still exposes the reviewer roster it needs', () => {
    const view = submissionToViewerJson(submission, 'editor') as {
      reviewAssignments?: Array<Record<string, unknown>>;
    };
    expect(view.reviewAssignments).toHaveLength(1);
    expect(view.reviewAssignments?.[0]).toMatchObject({
      id: 'ra-1',
      reviewerId: 'u-rev',
      status: 'accepted',
      reviewer: { id: 'u-rev', displayName: 'Dr Reviewer' },
    });
  });

  it('reviewAssignmentToEditorJson keeps identity, drops the hash', () => {
    const json = reviewAssignmentToEditorJson(assignment);
    expect(serialize(json)).not.toContain(HASH);
    expect(json.reviewer).toEqual({
      id: 'u-rev',
      displayName: 'Dr Reviewer',
      email: 'person@folio.test',
    });
  });

  it('copyeditAssignmentToEditorJson drops the hash', () => {
    const json = copyeditAssignmentToEditorJson({
      id: 'ca-1',
      slug: 'ce-1',
      submissionId: 's-1',
      copyeditorId: 'u-1',
      copyeditor: makeUser(),
      status: 'active',
      assignedAt: new Date('2026-02-01'),
      notes: [],
    } as never);
    expect(serialize(json)).not.toContain(HASH);
    expect(json.copyeditor).toMatchObject({ id: 'u-1' });
  });

  it('reviewDiscussionToJson reduces message authors to identity only', () => {
    const json = reviewDiscussionToJson({
      id: 'd-1',
      assignmentId: 'ra-1',
      subject: 'Clarification',
      createdAt: new Date('2026-02-02'),
      messages: [
        {
          id: 'm-1',
          discussionId: 'd-1',
          authorId: editor.id,
          author: editor,
          body: 'Please clarify section 3.',
          createdAt: new Date('2026-02-02'),
        },
      ],
    } as never);
    const text = serialize(json);
    expect(text).not.toContain(HASH);
    // Identity only: a reviewer has no business receiving the editor's address.
    expect(text).not.toContain('person@folio.test');
    expect((json.messages as Array<Record<string, unknown>>)[0].author).toEqual(
      { id: 'u-editor', displayName: 'An Editor' },
    );
  });

  it('@Exclude() strips the hash if a User is ever serialized directly', () => {
    // Backstop for the global ClassSerializerInterceptor.
    expect(serialize(instanceToPlain(makeUser()))).not.toContain(HASH);
    expect(instanceToPlain(makeUser())).not.toHaveProperty('passwordHash');
  });

  it('the hash is still readable in-process, so login keeps working', () => {
    expect(makeUser().passwordHash).toBe(HASH);
  });
});
