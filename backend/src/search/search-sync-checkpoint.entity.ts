import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Singleton row (id = 1) that persists the search sync watermark across
 * server restarts. Without this, every restart triggers a full re-bootstrap
 * instead of an incremental catch-up.
 */
@Entity('search_sync_checkpoints')
export class SearchSyncCheckpoint {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'timestamptz', name: 'last_synced_at' })
  lastSyncedAt: Date;
}
