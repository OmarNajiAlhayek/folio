import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export type NotificationSsePayload = {
  id: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, unknown>;
  href: string;
  createdAt: string;
};

type HubEvent = {
  kind: 'notification';
  userId: string;
  payload: NotificationSsePayload;
};

/**
 * In-process SSE fan-out. See ./README.md before running multiple API replicas.
 */
@Injectable()
export class NotificationHub {
  private readonly bus = new Subject<HubEvent>();

  emitNotification(userId: string, payload: NotificationSsePayload): void {
    this.bus.next({ kind: 'notification', userId, payload });
  }

  streamForUser(userId: string): Observable<MessageEvent> {
    return this.bus.pipe(
      filter((e) => e.userId === userId),
      map(
        (e) =>
          ({
            type: 'notification',
            data: JSON.stringify(e.payload),
          }) as MessageEvent,
      ),
    );
  }

  heartbeat(): MessageEvent {
    return { type: 'heartbeat', data: '{}' } as MessageEvent;
  }
}
