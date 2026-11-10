import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ClientEvent, PresenceStatus, ServerEvent } from '@pulse/shared';
import { Server, Socket } from 'socket.io';
import { AccessService } from '../common/access.service';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';

type SocketData = { userId?: string };

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly access: AccessService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('missing token');
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      (client.data as SocketData).userId = payload.sub;
      await client.join(this.userRoom(payload.sub));
      const memberships = await this.prisma.membership.findMany({
        where: { userId: payload.sub },
        select: { workspaceId: true },
      });
      await Promise.all(
        memberships.map((item) => client.join(this.workspaceRoom(item.workspaceId))),
      );
      const channels = await this.prisma.channelMember.findMany({
        where: { userId: payload.sub },
        select: { channelId: true },
      });
      await Promise.all(channels.map((item) => client.join(this.channelRoom(item.channelId))));
      await this.presence.connect(payload.sub, client.id);
      this.emitPresence(
        payload.sub,
        'online',
        memberships.map((item) => item.workspaceId),
      );
    } catch (error) {
      this.logger.debug(`Rejected socket: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client.data as SocketData).userId;
    if (!userId) return;
    const status = await this.presence
      .disconnect(userId, client.id)
      .catch(() => 'offline' as const);
    if (status === 'offline') {
      const memberships = await this.prisma.membership.findMany({
        where: { userId },
        select: { workspaceId: true },
      });
      this.emitPresence(
        userId,
        'offline',
        memberships.map((item) => item.workspaceId),
      );
    }
  }

  @SubscribeMessage(ClientEvent.roomJoin)
  async joinRoom(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId?: string }) {
    const userId = (client.data as SocketData).userId;
    if (!userId || !body?.channelId) return;
    try {
      await this.access.requireChannel(userId, body.channelId);
      await client.join(this.channelRoom(body.channelId));
    } catch {
      return;
    }
  }

  @SubscribeMessage(ClientEvent.presenceHeartbeat)
  async heartbeat(@ConnectedSocket() client: Socket) {
    const userId = (client.data as SocketData).userId;
    if (!userId) return;
    await this.presence.touch(userId);
  }

  @SubscribeMessage(ClientEvent.presenceSet)
  async setPresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { status?: 'online' | 'away' },
  ) {
    const userId = (client.data as SocketData).userId;
    if (!userId || (body?.status !== 'online' && body?.status !== 'away')) return;
    await this.presence.setStatus(userId, body.status);
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    this.emitPresence(
      userId,
      body.status,
      memberships.map((item) => item.workspaceId),
    );
  }

  @SubscribeMessage(ClientEvent.typingStart)
  async typingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId?: string },
  ) {
    await this.typing(client, body?.channelId, true);
  }

  @SubscribeMessage(ClientEvent.typingStop)
  async typingStop(@ConnectedSocket() client: Socket, @MessageBody() body: { channelId?: string }) {
    await this.typing(client, body?.channelId, false);
  }

  emitChannel(channelId: string, event: string, payload: unknown) {
    this.server?.to(this.channelRoom(channelId)).emit(event, payload);
  }

  emitWorkspace(workspaceId: string, event: string, payload: unknown) {
    this.server?.to(this.workspaceRoom(workspaceId)).emit(event, payload);
  }

  async joinUsers(userIds: string[], channelId: string) {
    if (!this.server) return;
    await Promise.all(
      userIds.map(async (userId) => {
        const sockets = await this.server.in(this.userRoom(userId)).fetchSockets();
        await Promise.all(sockets.map((socket) => socket.join(this.channelRoom(channelId))));
      }),
    );
  }

  private async typing(client: Socket, channelId: string | undefined, active: boolean) {
    const userId = (client.data as SocketData).userId;
    if (!userId || !channelId) return;
    try {
      await this.access.requireChannel(userId, channelId);
    } catch {
      return;
    }
    client.to(this.channelRoom(channelId)).emit(ServerEvent.typing, { channelId, userId, active });
  }

  private emitPresence(userId: string, status: PresenceStatus, workspaceIds: string[]) {
    for (const workspaceId of workspaceIds) {
      this.emitWorkspace(workspaceId, ServerEvent.presence, { userId, status });
    }
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private workspaceRoom(workspaceId: string) {
    return `workspace:${workspaceId}`;
  }

  private channelRoom(channelId: string) {
    return `channel:${channelId}`;
  }
}
