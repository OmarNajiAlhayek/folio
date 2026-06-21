import fs from 'fs';
import path from 'path';

const filePath = path.join('src', 'submissions', 'submissions.service.ts');
let s = fs.readFileSync(filePath, 'utf8');

if (!s.includes('SubmissionAiService')) {
  s = s.replace(
    "import { SubmissionLifecycleService } from './submission-lifecycle.service';",
    `import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { SubmissionAiService } from './submission-ai.service';`,
  );
  s = s.replace(
    '    private readonly lifecycle: SubmissionLifecycleService,\n  ) {}',
    `    private readonly lifecycle: SubmissionLifecycleService,
    private readonly ai: SubmissionAiService,
  ) {}`,
  );
}

const delegationBlock = `  listDisciplineLabels(): {
    labels: readonly string[];
    journalScope: string[];
  } {
    return this.ai.listDisciplineLabels();
  }

  async suggestDiscipline(
    slug: string,
    user: RequestUser,
  ): Promise<{
    topLabel: string;
    topConfidence: number;
    suggestedLabels: string[];
    probabilities: Record<string, number>;
    scopeInJournal: boolean;
    scopeWarning: string | null;
    disciplines: string[];
  }> {
    return this.ai.suggestDiscipline(slug, user);
  }

  async suggestKeywordsPreview(
    user: RequestUser,
    input: {
      title?: string;
      abstract?: string;
      titleAr?: string;
      abstractAr?: string;
    },
  ): Promise<{ keywordsEn: string[]; keywordsAr: string[] }> {
    return this.ai.suggestKeywordsPreview(user, input);
  }

  async suggestKeywords(
    slug: string,
    user: RequestUser,
  ): Promise<{ keywordsEn: string[]; keywordsAr: string[] }> {
    return this.ai.suggestKeywords(slug, user);
  }

  async setDisciplineForUser(
    slug: string,
    user: RequestUser,
    disciplines: string[],
  ): Promise<Submission> {
    return this.ai.setDisciplineForUser(slug, user, disciplines);
  }

`;

// Replace from listDisciplineLabels through setDisciplineForUser (before onModuleInit)
s = s.replace(
  /  listDisciplineLabels\(\):[\s\S]*?code: 'FORBIDDEN',\n    \}\);\n  \}\n\n  async onModuleInit/,
  `${delegationBlock}  async onModuleInit`,
);

const corpusDelegation = `  async startCorpusSimilarityJob(
    slug: string,
    user: RequestUser,
  ): Promise<AiJobResponse | CorpusSimilarityReport> {
    return this.ai.startCorpusSimilarityJob(slug, user);
  }

  async getCorpusSimilarityJob(
    slug: string,
    jobId: string,
    user: RequestUser,
  ): Promise<AiJobResponse> {
    return this.ai.getCorpusSimilarityJob(slug, jobId, user);
  }

  async getLatestCorpusSimilarityJob(
    slug: string,
    user: RequestUser,
  ): Promise<AiJobResponse | null> {
    return this.ai.getLatestCorpusSimilarityJob(slug, user);
  }

  async getSuggestedReviewers(
    slug: string,
    user: RequestUser,
  ): Promise<SuggestedReviewersReport> {
    return this.ai.getSuggestedReviewers(slug, user);
  }

`;

// Replace corpus similarity block through getSuggestedReviewers
s = s.replace(
  /  private async assertCorpusSimilarityAccess\([\s\S]*?return rows;\n  \}\n\n  async update\(/,
  `${corpusDelegation}  async update(`,
);

fs.writeFileSync(filePath, s);
console.log('patched submissions.service.ts for AI facade');
