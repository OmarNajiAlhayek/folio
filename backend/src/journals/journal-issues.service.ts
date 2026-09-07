import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalIssueStatus } from '../entities/journal-issue-status.enum';
import {
  issueCitationAr,
  issueCitationEn,
  issueCitationWithVolumeAr,
} from './journal-citation';

/**
 * Statuses that may receive an article at publish time.
 *
 * `open` is the issue being assembled. `published` is included because a
 * released issue still legitimately gains articles — Damascus University
 * publishes rolling additions to a current issue, and the seeded fixtures put
 * demo articles into العدد 1، 2026 for exactly that reason. `planned` is not
 * accepting yet and `closed` is finalised, so both are refused.
 */
const ISSUE_STATUSES_ACCEPTING_ARTICLES = [
  JournalIssueStatus.OPEN,
  JournalIssueStatus.PUBLISHED,
] as const;

export type PublishableIssue = {
  id: string;
  year: number;
  number: number;
  volume: number | null;
  status: JournalIssueStatus;
  titleAr: string | null;
  titleEn: string | null;
  /** `العدد 3، 2026` — the citation staff pick by. */
  citationAr: string;
  /** `No. 3 (2026)` */
  citationEn: string;
  /** Adds المجلد when the issue carries one; staff-facing only. */
  labelAr: string;
};

/**
 * Issues (الأعداد) as publication targets. Slice 4: an article cannot become
 * public without landing in one, so the citation العدد N، السنة YYYY is always
 * derivable.
 */
@Injectable()
export class JournalIssuesService {
  constructor(
    @InjectRepository(JournalIssue)
    private readonly issuesRepo: Repository<JournalIssue>,
  ) {}

  /** Issues of one journal that may receive an article, newest first. */
  async listPublishableIssues(journalId: string): Promise<PublishableIssue[]> {
    const rows = await this.issuesRepo.find({
      where: {
        journalId,
        status: In([...ISSUE_STATUSES_ACCEPTING_ARTICLES]),
      },
      order: { year: 'DESC', number: 'DESC' },
    });
    return rows.map((i) => this.toPublishableIssue(i));
  }

  /**
   * The issue an article is being published into, or a 400 explaining why it
   * cannot be. Checks journal ownership as well as status, so a caller cannot
   * file an article under another journal's issue.
   */
  async getIssueAcceptingArticleOrThrow(
    journalId: string,
    issueId: string,
  ): Promise<JournalIssue> {
    const issue = await this.issuesRepo.findOne({ where: { id: issueId } });
    if (!issue) {
      throw new BadRequestException({
        message: 'Issue not found',
        code: 'ISSUE_NOT_FOUND',
      });
    }
    if (issue.journalId !== journalId) {
      throw new BadRequestException({
        message: 'Issue belongs to a different journal than this submission',
        code: 'ISSUE_WRONG_JOURNAL',
      });
    }
    if (
      !ISSUE_STATUSES_ACCEPTING_ARTICLES.includes(
        issue.status as (typeof ISSUE_STATUSES_ACCEPTING_ARTICLES)[number],
      )
    ) {
      throw new BadRequestException({
        message: `Issue ${issueCitationEn(issue)} is ${issue.status} and cannot receive articles`,
        code: 'ISSUE_NOT_ACCEPTING_ARTICLES',
      });
    }
    return issue;
  }

  private toPublishableIssue(i: JournalIssue): PublishableIssue {
    return {
      id: i.id,
      year: i.year,
      number: i.number,
      volume: i.volume,
      status: i.status,
      titleAr: i.titleAr,
      titleEn: i.titleEn,
      citationAr: issueCitationAr(i),
      citationEn: issueCitationEn(i),
      labelAr: issueCitationWithVolumeAr(i),
    };
  }
}
