import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { SubmissionsService } from './submissions.service';
import type { ConstructorContent } from './constructor-content.types';

type CollabClient = WebSocket & {
  tabId?: string;
  slug?: string;
  userId?: string;
};

type CollabMessage =
  | {
      type: 'sync';
      slug: string;
      tabId: string;
      revision: number;
      lastModified: string;
      content: ConstructorContent;
    }
  | { type: 'ping' };

type RoomState = {
  revision: number;
  lastModified: string;
  content: ConstructorContent | null;
};

@WebSocketGateway({
  path: '/api/v1/ws/constructor-collab',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ConstructorCollabGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(ConstructorCollabGateway.name);
  private readonly rooms = new Map<string, Map<WebSocket, CollabClient>>();
  private readonly roomState = new Map<string, RoomState>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly submissions: SubmissionsService,
  ) {}

  onModuleDestroy(): void {
    this.rooms.clear();
    this.roomState.clear();
  }

  async handleConnection(client: CollabClient): Promise<void> {
    try {
      const url = new URL(client.url ?? '', 'http://localhost');
      const token =
        url.searchParams.get('token') ??
        client.protocol
          ?.split(',')
          .map((p) => p.trim())
          .find((p) => p.startsWith('folio.'))
          ?.slice(6);
      if (!token) {
        client.close(4401, 'Unauthorized');
        return;
      }
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      client.userId = payload.sub;
    } catch {
      client.close(4401, 'Unauthorized');
    }
  }

  handleDisconnect(client: CollabClient): void {
    if (!client.slug) return;
    const room = this.rooms.get(client.slug);
    room?.delete(client);
    if (room?.size === 0) {
      this.rooms.delete(client.slug);
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: CollabClient,
    @MessageBody()
    body: { slug: string; tabId: string },
  ): Promise<{ revision: number; content: ConstructorContent | null }> {
    if (!client.userId || !body?.slug || !body?.tabId) {
      return { revision: 0, content: null };
    }
    const submission = await this.submissions.getBySlugForAuthor(
      body.slug,
      client.userId,
    );
    if (!submission) {
      client.close(4403, 'Forbidden');
      return { revision: 0, content: null };
    }
    client.slug = body.slug;
    client.tabId = body.tabId;
    let room = this.rooms.get(body.slug);
    if (!room) {
      room = new Map();
      this.rooms.set(body.slug, room);
    }
    room.set(client, client);
    let state = this.roomState.get(body.slug);
    if (!state) {
      state = {
        revision: 0,
        lastModified: new Date(0).toISOString(),
        content: submission.constructorContent,
      };
      this.roomState.set(body.slug, state);
    }
    return { revision: state.revision, content: state.content };
  }

  @SubscribeMessage('sync')
  async handleSync(
    @ConnectedSocket() client: CollabClient,
    @MessageBody() body: CollabMessage,
  ): Promise<void> {
    if (body.type !== 'sync' || !client.userId || !client.slug) return;
    if (body.slug !== client.slug || body.tabId === client.tabId) return;
    const submission = await this.submissions.getBySlugForAuthor(
      body.slug,
      client.userId,
    );
    if (!submission) return;

    let state = this.roomState.get(body.slug);
    if (!state) {
      state = {
        revision: 0,
        lastModified: new Date(0).toISOString(),
        content: null,
      };
      this.roomState.set(body.slug, state);
    }
    if (body.lastModified <= state.lastModified) return;
    state.revision += 1;
    state.lastModified = body.lastModified;
    state.content = body.content;

    const room = this.rooms.get(body.slug);
    if (!room) return;
    const payload = JSON.stringify({
      type: 'remote-sync',
      revision: state.revision,
      lastModified: state.lastModified,
      content: body.content,
      fromTabId: body.tabId,
    });
    for (const peer of room.keys()) {
      if (peer === client) continue;
      if (peer.readyState === peer.OPEN) {
        try {
          peer.send(payload);
        } catch (err) {
          this.logger.debug(
            `Collab broadcast failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }
}
