import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ReviewAssignment,
  AssignmentStatus,
} from '../entities/review-assignment.entity';
import { ReviewDiscussion } from '../entities/review-discussion.entity';
import { ReviewDiscussionMessage } from '../entities/review-discussion-message.entity';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { SubmissionAccessService } from './submission-access.service';
import type { RequestUser } from '../common/types/request-user';

@Injectable()
export class ReviewDiscussionService {
  constructor(
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
    @InjectRepository(ReviewDiscussion)
    private readonly discussionsRepo: Repository<ReviewDiscussion>,
    @InjectRepository(ReviewDiscussionMessage)
    private readonly messagesRepo: Repository<ReviewDiscussionMessage>,
    private readonly access: SubmissionAccessService,
  ) {}

  private async loadAssignmentForActor(
    assignmentSlug: string,
    actor: RequestUser,
  ): Promise<ReviewAssignment> {
    const assignment = await this.assignmentsRepo.findOne({
      where: { slug: assignmentSlug },
      relations: ['submission'],
    });
    if (!assignment) {
      throw new NotFoundException({
        message: 'Assignment not found',
        code: 'NOT_FOUND',
      });
    }
    const isEditor = this.access.hasPerm(
      actor,
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    );
    const isOwnerReviewer = assignment.reviewerId === actor.sub;
    if (!isEditor && !isOwnerReviewer) {
      throw new ForbiddenException({
        message: 'Access denied',
        code: 'FORBIDDEN',
      });
    }
    if (
      !isEditor &&
      assignment.status !== AssignmentStatus.ACCEPTED &&
      assignment.status !== AssignmentStatus.COMPLETED
    ) {
      throw new BadRequestException({
        message: 'Accept the review invitation before starting a discussion',
        code: 'VALIDATION_ERROR',
      });
    }
    return assignment;
  }

  async listDiscussions(
    assignmentSlug: string,
    actor: RequestUser,
  ): Promise<ReviewDiscussion[]> {
    const assignment = await this.loadAssignmentForActor(assignmentSlug, actor);
    return this.discussionsRepo.find({
      where: { assignmentId: assignment.id },
      relations: ['messages', 'messages.author'],
      order: { createdAt: 'ASC' },
    });
  }

  async createDiscussion(
    assignmentSlug: string,
    actor: RequestUser,
    subject: string,
    body: string,
  ): Promise<ReviewDiscussion> {
    const assignment = await this.loadAssignmentForActor(assignmentSlug, actor);
    const trimSubject = (subject ?? '').trim();
    const trimBody = (body ?? '').trim();
    if (!trimBody) {
      throw new BadRequestException({
        message: 'Discussion body is required',
        code: 'VALIDATION_ERROR',
      });
    }

    const discussion = this.discussionsRepo.create({
      assignmentId: assignment.id,
      subject: trimSubject,
    });
    const savedDiscussion = await this.discussionsRepo.save(discussion);

    const message = this.messagesRepo.create({
      discussionId: savedDiscussion.id,
      authorId: actor.sub,
      body: trimBody,
    });
    await this.messagesRepo.save(message);

    return this.discussionsRepo.findOneOrFail({
      where: { id: savedDiscussion.id },
      relations: ['messages', 'messages.author'],
    });
  }

  async addMessage(
    assignmentSlug: string,
    discussionId: string,
    actor: RequestUser,
    body: string,
  ): Promise<ReviewDiscussionMessage> {
    const assignment = await this.loadAssignmentForActor(assignmentSlug, actor);
    const discussion = await this.discussionsRepo.findOne({
      where: { id: discussionId, assignmentId: assignment.id },
    });
    if (!discussion) {
      throw new NotFoundException({
        message: 'Discussion not found',
        code: 'NOT_FOUND',
      });
    }
    const trimBody = (body ?? '').trim();
    if (!trimBody) {
      throw new BadRequestException({
        message: 'Message body is required',
        code: 'VALIDATION_ERROR',
      });
    }
    const message = this.messagesRepo.create({
      discussionId: discussion.id,
      authorId: actor.sub,
      body: trimBody,
    });
    return this.messagesRepo.save(message);
  }
}
