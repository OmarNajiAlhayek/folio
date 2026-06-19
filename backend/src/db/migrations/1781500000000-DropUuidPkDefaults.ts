import { MigrationInterface, QueryRunner } from 'typeorm';

const UUID_PK_TABLES = [
  'users',
  'submissions',
  'submission_files',
  'review_assignments',
  'reviews',
  'copyedit_assignments',
  'copyedit_notes',
  'roles',
  'permissions',
  'role_invitations',
  'notifications',
  'oauth_identities',
  'auth_challenges',
  'refresh_sessions',
  'audit_log',
  'outbound_event_outbox',
  'ai_jobs',
] as const;

export class DropUuidPkDefaults1781500000000 implements MigrationInterface {
  name = 'DropUuidPkDefaults1781500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of UUID_PK_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "id" DROP DEFAULT`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of UUID_PK_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
      );
    }
  }
}
