import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchSyncCheckpoint1781400000000 implements MigrationInterface {
  name = 'AddSearchSyncCheckpoint1781400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "search_sync_checkpoints" (
        "id"             integer                     NOT NULL,
        "last_synced_at" TIMESTAMP WITH TIME ZONE    NOT NULL,
        CONSTRAINT "PK_search_sync_checkpoints" PRIMARY KEY ("id")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "search_sync_checkpoints"`);
  }
}
