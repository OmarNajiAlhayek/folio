import 'reflect-metadata';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module.ts';
import { SubmissionFile } from '../src/entities/submission-file.entity.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: false,
});
const repo = app.get(getRepositoryToken(SubmissionFile));
const since = new Date('2026-01-01');
const qb = repo
  .createQueryBuilder('f')
  .where('f.submission_id = :submissionId', {
    submissionId: '00000000-0000-4000-8000-000000000001',
  })
  .andWhere('f.kind = :kind', { kind: 'manuscript' })
  .andWhere('f.createdAt > :since', { since });
console.log('sql1', qb.getSql());
const qb2 = repo
  .createQueryBuilder('f')
  .where('f.submissionId = :submissionId', {
    submissionId: '00000000-0000-4000-8000-000000000001',
  })
  .andWhere('f.kind = :kind', { kind: 'manuscript' })
  .andWhere('f.createdAt > :since', { since });
console.log('sql2', qb2.getSql());
await app.close();
