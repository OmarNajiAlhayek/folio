import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalIssueStatus } from '../entities/journal-issue-status.enum';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { issueCitationAr, issueCitationEn } from './journal-citation';

export type PortalJournal = {
  slug: string;
  titleAr: string;
  titleEn: string;
  disciplineLabel: string;
  issn: string | null;
  eissn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** Published articles across every released issue. */
  articleCount: number;
  latestIssue: PortalIssueSummary | null;
};

export type PortalIssueSummary = {
  year: number;
  number: number;
  volume: number | null;
  titleAr: string | null;
  titleEn: string | null;
  publishedAt: Date | null;
  citationAr: string;
  citationEn: string;
  articleCount: number;
};

/**
 * Read model for the public portal: press → journal → issue → article.
 *
 * Only `published` issues and `published` articles are ever exposed. A retracted
 * article keeps its issue row but must not appear, which is why every query
 * filters on submission status rather than on `issue_id` alone.
 */
@Injectable()
export class JournalPortalService {
  constructor(
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
    @InjectRepository(JournalIssue)
    private readonly issuesRepo: Repository<JournalIssue>,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
  ) {}

  /** Every active journal, in the catalog's own display order. */
  async listJournals(): Promise<PortalJournal[]> {
    const journals = await this.journalsRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    if (journals.length === 0) return [];

    const journalIds = journals.map((j) => j.id);
    const [countsByJournal, latestByJournal] = await Promise.all([
      this.publishedArticleCountsByJournal(journalIds),
      this.latestPublishedIssueByJournal(journalIds),
    ]);

    return journals.map((j) => ({
      ...this.toPortalJournalBase(j),
      articleCount: countsByJournal.get(j.id) ?? 0,
      latestIssue: latestByJournal.get(j.id) ?? null,
    }));
  }

  /** One journal with its released issues, newest first. */
  async getJournalBySlug(slug: string): Promise<{
    journal: PortalJournal;
    issues: PortalIssueSummary[];
  }> {
    const journal = await this.journalsRepo.findOne({
      where: { slug, isActive: true },
    });
    if (!journal) {
      throw new NotFoundException({
        message: 'Journal not found',
        code: 'NOT_FOUND',
      });
    }
    const issues = await this.issuesRepo.find({
      where: { journalId: journal.id, status: JournalIssueStatus.PUBLISHED },
      order: { year: 'DESC', number: 'DESC' },
    });
    const counts = await this.publishedArticleCountsByIssue(
      issues.map((i) => i.id),
    );
    const summaries = issues.map((i) => ({
      ...this.toIssueSummary(i),
      articleCount: counts.get(i.id) ?? 0,
    }));
    const [latest] = summaries;
    return {
      journal: {
        ...this.toPortalJournalBase(journal),
        articleCount: summaries.reduce((n, i) => n + i.articleCount, 0),
        latestIssue: latest ?? null,
      },
      issues: summaries,
    };
  }

  /**
   * One issue's table of contents. `year` and `number` address it rather than
   * an id, because `/journals/engj/issues/2026/3` is the public URL contract.
   */
  async getIssue(
    slug: string,
    year: number,
    number: number,
  ): Promise<{
    journal: PortalJournal;
    issue: PortalIssueSummary;
    articles: Submission[];
  }> {
    const journal = await this.journalsRepo.findOne({
      where: { slug, isActive: true },
    });
    if (!journal) {
      throw new NotFoundException({
        message: 'Journal not found',
        code: 'NOT_FOUND',
      });
    }
    const issue = await this.issuesRepo.findOne({
      where: {
        journalId: journal.id,
        year,
        number,
        status: JournalIssueStatus.PUBLISHED,
      },
    });
    if (!issue) {
      throw new NotFoundException({
        message: 'Issue not found',
        code: 'NOT_FOUND',
      });
    }
    const articles = await this.submissionsRepo.find({
      where: { issueId: issue.id, status: SubmissionStatus.PUBLISHED },
      relations: ['author'],
      order: { publishedAt: 'ASC' },
    });
    return {
      journal: {
        ...this.toPortalJournalBase(journal),
        articleCount: articles.length,
        latestIssue: null,
      },
      issue: { ...this.toIssueSummary(issue), articleCount: articles.length },
      articles,
    };
  }

  private toPortalJournalBase(
    j: Journal,
  ): Omit<PortalJournal, 'articleCount' | 'latestIssue'> {
    return {
      slug: j.slug,
      titleAr: j.titleAr,
      titleEn: j.titleEn,
      disciplineLabel: j.disciplineLabel,
      issn: j.issn,
      eissn: j.eissn,
      descriptionAr: j.descriptionAr,
      descriptionEn: j.descriptionEn,
    };
  }

  private toIssueSummary(i: JournalIssue): PortalIssueSummary {
    return {
      year: i.year,
      number: i.number,
      volume: i.volume,
      titleAr: i.titleAr,
      titleEn: i.titleEn,
      publishedAt: i.publishedAt,
      citationAr: issueCitationAr(i),
      citationEn: issueCitationEn(i),
      articleCount: 0,
    };
  }

  /** One grouped count rather than a query per journal. */
  private async publishedArticleCountsByJournal(
    journalIds: string[],
  ): Promise<Map<string, number>> {
    if (journalIds.length === 0) return new Map();
    const rows = await this.submissionsRepo
      .createQueryBuilder('s')
      .select('s.journal_id', 'journalId')
      .addSelect('COUNT(*)', 'cnt')
      .where('s.journal_id IN (:...journalIds)', { journalIds })
      .andWhere('s.status = :status', { status: SubmissionStatus.PUBLISHED })
      .andWhere('s.issue_id IS NOT NULL')
      .groupBy('s.journal_id')
      .getRawMany<{ journalId: string; cnt: string }>();
    return new Map(rows.map((r) => [r.journalId, parseInt(r.cnt, 10)]));
  }

  private async publishedArticleCountsByIssue(
    issueIds: string[],
  ): Promise<Map<string, number>> {
    if (issueIds.length === 0) return new Map();
    const rows = await this.submissionsRepo
      .createQueryBuilder('s')
      .select('s.issue_id', 'issueId')
      .addSelect('COUNT(*)', 'cnt')
      .where('s.issue_id IN (:...issueIds)', { issueIds })
      .andWhere('s.status = :status', { status: SubmissionStatus.PUBLISHED })
      .groupBy('s.issue_id')
      .getRawMany<{ issueId: string; cnt: string }>();
    return new Map(rows.map((r) => [r.issueId, parseInt(r.cnt, 10)]));
  }

  private async latestPublishedIssueByJournal(
    journalIds: string[],
  ): Promise<Map<string, PortalIssueSummary>> {
    if (journalIds.length === 0) return new Map();
    const issues = await this.issuesRepo.find({
      where: { status: JournalIssueStatus.PUBLISHED },
      order: { year: 'DESC', number: 'DESC' },
    });
    const wanted = new Set(journalIds);
    const latest = new Map<string, PortalIssueSummary>();
    for (const i of issues) {
      if (!wanted.has(i.journalId) || latest.has(i.journalId)) continue;
      latest.set(i.journalId, this.toIssueSummary(i));
    }
    const counts = await this.publishedArticleCountsByIssue(
      issues
        .filter((i) => latest.get(i.journalId)?.year === i.year)
        .map((i) => i.id),
    );
    for (const i of issues) {
      const summary = latest.get(i.journalId);
      if (summary && summary.year === i.year && summary.number === i.number) {
        summary.articleCount = counts.get(i.id) ?? 0;
      }
    }
    return latest;
  }
}
