import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  In,
  IsNull,
  Repository,
  type QueryDeepPartialEntity,
} from 'typeorm';
import { Notification } from '../entities/notification.entity';
import {
  NOTIFICATION_I18N,
  NOTIFICATION_TYPE,
  type NotificationType,
} from './notification-types';
import {
  NotificationHub,
  type NotificationSsePayload,
} from './notification-hub';

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  params?: Record<string, unknown>;
  href: string;
  idempotencyKey: string;
};

export type NotificationDto = {
  id: string;
  type: NotificationType;
  titleKey: string;
  bodyKey: string;
  params: Record<string, unknown>;
  href: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationListResult = {
  items: NotificationDto[];
  nextCursor: string | null;
};

export type NotificationFilter = 'all' | 'unread' | 'read';

/** `.returning('*')` on insert uses DB column names (`created_at`), not entity fields. */
function notificationFromInsertRaw(raw: Record<string, unknown>): Notification {
  const createdAtRaw = raw.createdAt ?? raw.created_at;
  const readAtRaw = raw.readAt ?? raw.read_at;
  return {
    ...(raw as unknown as Notification),
    createdAt:
      createdAtRaw instanceof Date
        ? createdAtRaw
        : new Date(String(createdAtRaw)),
    readAt:
      readAtRaw == null
        ? null
        : readAtRaw instanceof Date
          ? readAtRaw
          : new Date(String(readAtRaw)),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly hub: NotificationHub,
  ) {}

  toDto(row: Notification): NotificationDto {
    return {
      id: row.id,
      type: row.type,
      titleKey: row.titleKey,
      bodyKey: row.bodyKey,
      params: row.params ?? {},
      href: row.href,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
    };
  }

  toSsePayload(row: Notification): NotificationSsePayload {
    return {
      id: row.id,
      type: row.type,
      titleKey: row.titleKey,
      bodyKey: row.bodyKey,
      params: row.params ?? {},
      href: row.href,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Insert notification inside a transaction. Returns the row if created,
   * null on idempotency conflict. Does NOT emit SSE — call emitCreated after commit.
   */
  async createIfAbsent(
    input: CreateNotificationInput,
    manager: EntityManager | null = null,
  ): Promise<Notification | null> {
    const created = await this.createManyIfAbsent([input], manager);
    return created[0] ?? null;
  }

  /**
   * Insert notifications inside a transaction, skipping rows that already exist
   * (by idempotency key). Returns only newly created rows. Does NOT emit SSE.
   */
  async createManyIfAbsent(
    inputs: CreateNotificationInput[],
    manager: EntityManager | null = null,
  ): Promise<Notification[]> {
    if (inputs.length === 0) {
      return [];
    }
    const repo = manager ? manager.getRepository(Notification) : this.repo;
    const keys = inputs.map((i) => i.idempotencyKey);
    const existing = await repo.find({
      where: { idempotencyKey: In(keys) },
      select: ['idempotencyKey'],
    });
    const existingKeys = new Set(existing.map((row) => row.idempotencyKey));
    const toInsert = inputs.filter((i) => !existingKeys.has(i.idempotencyKey));
    if (toInsert.length === 0) {
      return [];
    }
    const values = toInsert.map((input) => {
      const i18n = NOTIFICATION_I18N[input.type];
      return {
        userId: input.userId,
        type: input.type,
        titleKey: i18n.titleKey,
        bodyKey: i18n.bodyKey,
        params: input.params ?? {},
        href: input.href,
        idempotencyKey: input.idempotencyKey,
        readAt: null,
      };
    });
    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(values as QueryDeepPartialEntity<Notification>[])
      .orIgnore()
      .returning('*')
      .execute();
    return ((result.raw as Record<string, unknown>[]) ?? []).map(
      notificationFromInsertRaw,
    );
  }

  /** Post-commit: push live SSE events for newly created rows. */
  emitCreated(rows: Notification[]): void {
    for (const row of rows) {
      this.hub.emitNotification(row.userId, this.toSsePayload(row));
    }
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({
      where: { userId, readAt: IsNull() },
    });
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
    try {
      const raw = Buffer.from(cursor, 'base64url').toString('utf8');
      const sep = raw.lastIndexOf('|');
      if (sep <= 0) return null;
      const createdAt = new Date(raw.slice(0, sep));
      const id = raw.slice(sep + 1);
      if (Number.isNaN(createdAt.getTime()) || !id) return null;
      return { createdAt, id };
    } catch {
      return null;
    }
  }

  private encodeCursor(row: Notification): string {
    return Buffer.from(
      `${row.createdAt.toISOString()}|${row.id}`,
      'utf8',
    ).toString('base64url');
  }

  async listForUser(
    userId: string,
    options: {
      filter?: NotificationFilter;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<NotificationListResult> {
    const filter = options.filter ?? 'all';
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId });

    if (filter === 'unread') {
      qb.andWhere('n.read_at IS NULL');
    } else if (filter === 'read') {
      qb.andWhere('n.read_at IS NOT NULL');
    }

    const decoded = options.cursor
      ? this.decodeCursor(options.cursor)
      : null;
    if (options.cursor && !decoded) {
      return { items: [], nextCursor: null };
    }
    if (decoded) {
      qb.andWhere(
        '(n.created_at < :createdAt OR (n.created_at = :createdAt AND n.id < :id))',
        {
          createdAt: decoded.createdAt,
          id: decoded.id,
        },
      );
    }

    qb.orderBy('n.created_at', 'DESC').addOrderBy('n.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? this.encodeCursor(page[page.length - 1]!)
        : null;

    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor,
    };
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationDto> {
    const row = await this.repo.findOne({
      where: { id: notificationId, userId },
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Notification not found',
        code: 'NOT_FOUND',
      });
    }
    if (!row.readAt) {
      row.readAt = new Date();
      await this.repo.save(row);
    }
    return this.toDto(row);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }
}
