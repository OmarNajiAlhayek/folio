import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { skipAllThrottles } from '../common/throttle-profiles';
import { OpsMetricsGuard } from '../common/guards/ops-metrics.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiJob,
  type AiJobStatus,
  type AiJobType,
} from '../entities/ai-job.entity';

type StatusCounts = Record<AiJobStatus, number>;
type TypeStatusCounts = Record<AiJobType, StatusCounts>;

const JOB_STATUSES: AiJobStatus[] = [
  'pending',
  'queued',
  'running',
  'completed',
  'failed',
];
const JOB_TYPES: AiJobType[] = ['similarity_index', 'corpus_similarity'];

function emptyStatusCounts(): StatusCounts {
  return {
    pending: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
  };
}

/**
 * Operational aggregate of async AI jobs — counts by status and type.
 * Read-only, for the perf harness and deploy monitoring. Open by default;
 * set `OPS_METRICS_TOKEN` to require `x-folio-ops-token`. See OpsMetricsGuard.
 */
@ApiTags('health')
@Controller('health/ai-jobs')
@SkipThrottle(skipAllThrottles())
@UseGuards(OpsMetricsGuard)
export class AiJobsHealthController {
  constructor(
    @InjectRepository(AiJob)
    private readonly jobsRepo: Repository<AiJob>,
  ) {}

  @Get()
  async stats() {
    const rows = await this.jobsRepo
      .createQueryBuilder('j')
      .select('j.job_type', 'jobType')
      .addSelect('j.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('j.job_type')
      .addGroupBy('j.status')
      .getRawMany<{ jobType: AiJobType; status: AiJobStatus; count: number }>();

    const byType: TypeStatusCounts = {
      similarity_index: emptyStatusCounts(),
      corpus_similarity: emptyStatusCounts(),
    };
    const totals = emptyStatusCounts();

    for (const row of rows) {
      if (
        !JOB_TYPES.includes(row.jobType) ||
        !JOB_STATUSES.includes(row.status)
      ) {
        continue;
      }
      byType[row.jobType][row.status] = row.count;
      totals[row.status] += row.count;
    }

    const total = JOB_STATUSES.reduce((sum, s) => sum + totals[s], 0);

    return {
      total,
      byStatus: totals,
      byType,
    };
  }
}
