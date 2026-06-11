import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { submissionToViewerJson } from './submission-response.mapper';

describe('submissionToViewerJson messageForAuthor', () => {
  const base = {
    id: 'sub-1',
    slug: 'paper-one',
    title: 'Title',
    titleAr: null,
    abstract: 'Abstract',
    abstractAr: null,
    articleType: null,
    keywords: null,
    keywordsAr: null,
    status: SubmissionStatus.REVISIONS_REQUESTED,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: null,
    reviewMethod: 'double_anonymous',
    files: [],
    authorId: 'author-1',
    messageForAuthor: 'Please revise section 2.',
  } as Submission;

  it('exposes messageForAuthor to author and editor viewers', () => {
    expect(submissionToViewerJson(base, 'author').messageForAuthor).toBe(
      'Please revise section 2.',
    );
    expect(submissionToViewerJson(base, 'editor').messageForAuthor).toBe(
      'Please revise section 2.',
    );
  });

  it('hides messageForAuthor from reviewer and copyeditor viewers', () => {
    expect(
      submissionToViewerJson(base, 'reviewer').messageForAuthor,
    ).toBeUndefined();
    expect(
      submissionToViewerJson(base, 'copyeditor').messageForAuthor,
    ).toBeUndefined();
  });
});
