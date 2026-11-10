import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelKind, Prisma } from '@prisma/client';
import { ChannelDto, ChannelPreview, PublicUser, ServerEvent } from '@pulse/shared';
import { AccessService } from '../common/access.service';
import { toPublicUser } from '../common/public-user';
import { directChannelName, isUniqueViolation } from '../lib/text';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AddMemberDto, CreateChannelDto } from './dto';

type ChannelWithMembers = Prisma.ChannelGetPayload<{
  include: { members: { include: { user: true } } };
}>;

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(userId: string, workspaceId: string): Promise<ChannelDto[]> {
    await this.access.requireMembership(userId, workspaceId);
    const channels = await this.prisma.channel.findMany({
      where: { workspaceId, members: { some: { userId } } },
      include: { members: { include: { user: true } } },
    });
    const ids = channels.map((channel) => channel.id);
    const [unread, previews] = await Promise.all([
      this.unreadCounts(userId, ids),
      this.lastMessages(ids),
    ]);
    return channels
      .map((channel) =>
        this.toDto(channel, userId, unread.get(channel.id) ?? 0, previews.get(channel.id) ?? null),
      )
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'CHANNEL' ? -1 : 1;
        if (a.kind === 'DIRECT') {
          return (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? '');
        }
        return a.name.localeCompare(b.name);
      });
  }

  async create(userId: string, workspaceId: string, dto: CreateChannelDto): Promise<ChannelDto> {
    await this.access.requireMembership(userId, workspaceId);
    const memberIds = new Set<string>([userId, ...(dto.memberIds ?? [])]);
    if (dto.isPrivate) {
      const members = await this.prisma.membership.findMany({
        where: { workspaceId, userId: { in: [...memberIds] } },
        select: { userId: true },
      });
      if (members.length !== memberIds.size) {
        throw new BadRequestException(
          'Every person on a private channel must already be in the workspace',
        );
      }
    }
    try {
      const channel = await this.prisma.channel.create({
        data: {
          workspaceId,
          name: dto.name,
          topic: dto.topic?.trim() ?? '',
          kind: 'CHANNEL',
          isPrivate: Boolean(dto.isPrivate),
          createdById: userId,
          members: {
            create: dto.isPrivate
              ? [...memberIds].map((id) => ({ userId: id }))
              : (
                  await this.prisma.membership.findMany({
                    where: { workspaceId },
                    select: { userId: true },
                  })
                ).map((member) => ({ userId: member.userId })),
          },
        },
        include: { members: { include: { user: true } } },
      });
      await this.announce(channel);
      return this.toDto(channel, userId, 0, null);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('A channel with that name already exists');
      throw error;
    }
  }

  async createGeneral(userId: string, workspaceId: string) {
    const channel = await this.prisma.channel.create({
      data: {
        workspaceId,
        name: 'general',
        topic: 'Company-wide notes and decisions',
        kind: 'CHANNEL',
        isPrivate: false,
        createdById: userId,
        members: { create: { userId } },
      },
    });
    await this.realtime.joinUsers([userId], channel.id);
    this.realtime.emitWorkspace(workspaceId, ServerEvent.directoryChanged, { workspaceId });
    return channel;
  }

  async openDirect(userId: string, workspaceId: string, otherUserId: string): Promise<ChannelDto> {
    if (userId === otherUserId) throw new BadRequestException('Choose a teammate');
    await this.access.requireMembership(userId, workspaceId);
    await this.access.requireMembership(otherUserId, workspaceId);
    const name = directChannelName(userId, otherUserId);
    const existing = await this.prisma.channel.findUnique({
      where: { workspaceId_name: { workspaceId, name } },
      include: { members: { include: { user: true } } },
    });
    if (existing) return this.toDto(existing, userId, 0, null);
    try {
      const channel = await this.prisma.channel.create({
        data: {
          workspaceId,
          name,
          topic: '',
          kind: 'DIRECT',
          isPrivate: true,
          createdById: userId,
          members: { create: [{ userId }, { userId: otherUserId }] },
        },
        include: { members: { include: { user: true } } },
      });
      await this.announce(channel);
      return this.toDto(channel, userId, 0, null);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const channel = await this.prisma.channel.findUniqueOrThrow({
        where: { workspaceId_name: { workspaceId, name } },
        include: { members: { include: { user: true } } },
      });
      return this.toDto(channel, userId, 0, null);
    }
  }

  async addMember(userId: string, channelId: string, dto: AddMemberDto) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.kind === 'DIRECT')
      throw new BadRequestException('Direct messages stay between two people');
    const membership = await this.access.requireMembership(userId, channel.workspaceId);
    if (channel.isPrivate && membership.role === 'MEMBER' && channel.createdById !== userId) {
      const actor = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!actor) throw new NotFoundException('Channel not found');
    }
    await this.access.requireMembership(dto.userId, channel.workspaceId);
    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: dto.userId } },
      create: { channelId, userId: dto.userId },
      update: {},
    });
    await this.realtime.joinUsers([dto.userId], channelId);
    this.realtime.emitWorkspace(channel.workspaceId, ServerEvent.directoryChanged, {
      workspaceId: channel.workspaceId,
    });
    return { ok: true };
  }

  async markRead(userId: string, channelId: string) {
    await this.access.requireChannel(userId, channelId);
    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  async joinAllPublic(userId: string, workspaceId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { workspaceId, kind: 'CHANNEL', isPrivate: false },
      select: { id: true },
    });
    if (channels.length === 0) return;
    await this.prisma.channelMember.createMany({
      data: channels.map((channel) => ({ channelId: channel.id, userId })),
      skipDuplicates: true,
    });
    for (const channel of channels) {
      await this.realtime.joinUsers([userId], channel.id);
    }
  }

  private async announce(channel: ChannelWithMembers) {
    const userIds = channel.members.map((member) => member.userId);
    await this.realtime.joinUsers(userIds, channel.id);
    this.realtime.emitWorkspace(channel.workspaceId, ServerEvent.directoryChanged, {
      workspaceId: channel.workspaceId,
    });
  }

  private async unreadCounts(userId: string, channelIds: string[]) {
    const map = new Map<string, number>();
    if (channelIds.length === 0) return map;
    const rows = await this.prisma.$queryRaw<Array<{ channelId: string; count: number }>>`
      SELECT cm."channelId" AS "channelId", COUNT(m.id)::int AS "count"
      FROM "ChannelMember" cm
      JOIN "Message" m ON m."channelId" = cm."channelId"
      WHERE cm."userId" = ${userId}
        AND cm."channelId" IN (${Prisma.join(channelIds)})
        AND m."createdAt" > cm."lastReadAt"
        AND m."authorId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND (
          m."parentId" IS NULL
          OR EXISTS (
            SELECT 1 FROM "Mention" men
            WHERE men."messageId" = m.id AND men."userId" = ${userId}
          )
        )
      GROUP BY cm."channelId"
    `;
    for (const row of rows) map.set(row.channelId, Number(row.count));
    return map;
  }

  private async lastMessages(channelIds: string[]) {
    const map = new Map<string, ChannelPreview>();
    if (channelIds.length === 0) return map;
    const rows = await this.prisma.$queryRaw<
      Array<{ channelId: string; id: string; body: string; createdAt: Date; authorName: string }>
    >`
      SELECT DISTINCT ON (m."channelId")
        m."channelId" AS "channelId",
        m.id,
        m.body,
        m."createdAt" AS "createdAt",
        u.name AS "authorName"
      FROM "Message" m
      JOIN "User" u ON u.id = m."authorId"
      WHERE m."channelId" IN (${Prisma.join(channelIds)})
        AND m."parentId" IS NULL
        AND m."deletedAt" IS NULL
      ORDER BY m."channelId", m."createdAt" DESC
    `;
    for (const row of rows) {
      map.set(row.channelId, {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        authorName: row.authorName,
      });
    }
    return map;
  }

  private toDto(
    channel: ChannelWithMembers,
    userId: string,
    unreadCount: number,
    lastMessage: ChannelPreview | null,
  ): ChannelDto {
    const peer = this.peer(channel, userId);
    return {
      id: channel.id,
      workspaceId: channel.workspaceId,
      name: channel.kind === 'DIRECT' ? (peer?.name ?? 'Direct message') : channel.name,
      topic: channel.topic,
      kind: channel.kind,
      isPrivate: channel.isPrivate,
      unreadCount,
      lastMessage,
      peer,
      memberIds: channel.members.map((member) => member.userId),
    };
  }

  private peer(channel: ChannelWithMembers, userId: string): PublicUser | null {
    if (channel.kind !== ChannelKind.DIRECT) return null;
    const other = channel.members.find((member) => member.userId !== userId);
    return other ? toPublicUser(other.user) : null;
  }
}
