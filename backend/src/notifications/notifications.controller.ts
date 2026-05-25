import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { defer, from, interval, map, merge, Observable } from 'rxjs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { NotificationHub } from './notification-hub';
import {
  NotificationsService,
  type NotificationFilter,
} from './notifications.service';

const HEARTBEAT_MS = 25_000;

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly hub: NotificationHub,
  ) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query('filter') filter?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const filterVal: NotificationFilter =
      filter === 'unread' || filter === 'read' ? filter : 'all';
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    return this.notifications.listForUser(user.sub, {
      filter: filterVal,
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor: cursor?.trim() || undefined,
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: RequestUser) {
    return this.notifications.unreadCount(user.sub).then((count) => ({ count }));
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user.sub);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(user.sub, id);
  }

  @Sse('stream')
  stream(@CurrentUser() user: RequestUser): Observable<MessageEvent> {
    const userId = user.sub;

    const connected$ = defer(() =>
      from(this.notifications.unreadCount(userId)).pipe(
        map(
          (unreadCount) =>
            ({
              type: 'connected',
              data: JSON.stringify({ unreadCount }),
            }) as MessageEvent,
        ),
      ),
    );

    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(() => this.hub.heartbeat()),
    );

    return merge(connected$, this.hub.streamForUser(userId), heartbeat$);
  }
}
