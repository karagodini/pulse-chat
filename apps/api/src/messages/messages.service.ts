import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ALLOWED_REACTIONS,
  MessageAttachment,
  MessageDto,
  MessageMention,
  MessageReaction,
  MessagesPage,
  ServerEvent,
} from '@pulse/shared';
import { AccessService } from '../common/access.service';
import { toPublicUser } from '../common/public-user';
import { extractHandles } from '../lib/text';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UploadsService } from '../uploads/uploads.service';
import { CreateMessageDto, UpdateMessageDto } from './dto';

const include = {
  author: true,
  reactions: true,
  mentions: { include: { user: true } },
  attachments: true,
  _count: { select: { replies: { where: { deletedAt: null } } } },
} satisfies Prisma.MessageInclude;

type Row = Prisma.MessageGetPayload<{ include: typeof include }>;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
    private readonly uploads: UploadsService,
  ) {}

  async list(
    userId: string,
    channelId: string,
    cursor: string | undefined,
    parentId: string | undefined,
    limitInput?: string,
  ): Promise<MessagesPage> {
    const channel = await this.access.requireChannel(userId, channelId);
    const threadParent = parentId || null;
    if (!channel.isPrivate && channel.kind === 'CHANNEL') {
      await this.prisma.channelMember.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId },
        update: {},
      });
    }
    const take = Math.min(Math.max(Number(limitInput) || 40, 1), 100);
    const cursorMessage = cursor
      ? await this.prisma.message.findFirst({ where: { id: cursor, channelId } })
      : null;
    const rows = await this.prisma.message.findMany({
      where: {
        channelId,
        parentId: threadParent,
        ...(cursorMessage ? { createdAt: { lt: cursorMessage.createdAt } } : {}),
      },
      include,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse();
    const items = await Promise.all(page.map((row) => this.serialize(row, userId)));
    return { items, nextCursor: hasMore ? page[0].id : null };
  }

  async get(userId: string, messageId: string): Promise<MessageDto> {
    const row = await this.prisma.message.findUnique({ where: { id: messageId }, include });
    if (!row) throw new NotFoundException('Message not found');
    await this.access.requireChannel(userId, row.channelId);
    return this.serialize(row, userId);
  }

  async create(userId: string, channelId: string, dto: CreateMessageDto): Promise<MessageDto> {
    const channel = await this.access.requireChannel(userId, channelId);
    const body = dto.body?.trim() ?? '';
    const attachmentIds = dto.attachmentIds ?? [];
    if (!body && attachmentIds.length === 0) {
      throw new BadRequestException('Write a message or attach a file');
    }
    if (dto.parentId) {
      const parent = await this.prisma.message.findFirst({
        where: { id: dto.parentId, channelId, parentId: null, deletedAt: null },
      });
      if (!parent) throw new BadRequestException('That thread is not available');
    }
    if (attachmentIds.length > 0) {
      const owned = await this.prisma.attachment.count({
        where: { id: { in: attachmentIds }, uploadedBy: userId, messageId: null },
      });
      if (owned !== attachmentIds.length) {
        throw new BadRequestException('One of those files is not available');
      }
    }
    const handles = extractHandles(body);
    const mentioned = handles.length
      ? await this.prisma.user.findMany({
          where: {
            handle: { in: handles },
            memberships: { some: { workspaceId: channel.workspaceId } },
          },
        })
      : [];

    const row = await this.prisma.message.create({
      data: {
        channelId,
        authorId: userId,
        parentId: dto.parentId,
        body,
        mentions: { create: mentioned.map((user) => ({ userId: user.id })) },
      },
      include,
    });
    if (attachmentIds.length > 0) {
      await this.prisma.attachment.updateMany({
        where: { id: { in: attachmentIds }, uploadedBy: userId, messageId: null },
        data: { messageId: row.id },
      });
    }
    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    const saved = await this.prisma.message.findUniqueOrThrow({ where: { id: row.id }, include });
    const message = await this.serialize(saved, userId);
    this.realtime.emitChannel(channelId, ServerEvent.messageCreated, message);
    this.realtime.emitWorkspace(channel.workspaceId, ServerEvent.directoryChanged, {
      workspaceId: channel.workspaceId,
    });
    return message;
  }

  async update(userId: string, messageId: string, dto: UpdateMessageDto): Promise<MessageDto> {
    const existing = await this.requireAuthor(userId, messageId);
    const body = dto.body.trim();
    if (!body && existing.attachments.length === 0) {
      throw new BadRequestException('A message needs text or a file');
    }
    const channel = await this.access.requireChannel(userId, existing.channelId);
    const handles = extractHandles(body);
    const mentioned = handles.length
      ? await this.prisma.user.findMany({
          where: {
            handle: { in: handles },
            memberships: { some: { workspaceId: channel.workspaceId } },
          },
        })
      : [];
    await this.prisma.mention.deleteMany({ where: { messageId } });
    const saved = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        body,
        editedAt: new Date(),
        mentions: { create: mentioned.map((user) => ({ userId: user.id })) },
      },
      include,
    });
    const message = await this.serialize(saved, userId);
    this.realtime.emitChannel(existing.channelId, ServerEvent.messageUpdated, message);
    return message;
  }

  async remove(userId: string, messageId: string): Promise<MessageDto> {
    const existing = await this.prisma.message.findUnique({ where: { id: messageId }, include });
    if (!existing || existing.deletedAt) throw new NotFoundException('Message not found');
    const channel = await this.access.requireChannel(userId, existing.channelId);
    const membership = await this.access.requireMembership(userId, channel.workspaceId);
    if (existing.authorId !== userId && membership.role === 'MEMBER') {
      throw new ForbiddenException('You can only remove your own messages');
    }
    const saved = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: '' },
      include,
    });
    const message = await this.serialize(saved, userId);
    this.realtime.emitChannel(existing.channelId, ServerEvent.messageDeleted, message);
    this.realtime.emitWorkspace(channel.workspaceId, ServerEvent.directoryChanged, {
      workspaceId: channel.workspaceId,
    });
    return message;
  }

  async react(userId: string, messageId: string, emoji: string) {
    if (!ALLOWED_REACTIONS.includes(emoji as (typeof ALLOWED_REACTIONS)[number])) {
      throw new BadRequestException('Choose one of the available reactions');
    }
    const existing = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Message not found');
    await this.access.requireChannel(userId, existing.channelId);
    const current = await this.prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });
    if (current) {
      await this.prisma.reaction.delete({ where: { id: current.id } });
    } else {
      await this.prisma.reaction.create({ data: { messageId, userId, emoji } });
    }
    const saved = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include,
    });
    const message = await this.serialize(saved, userId);
    this.realtime.emitChannel(existing.channelId, ServerEvent.reactionUpdated, {
      messageId,
      channelId: existing.channelId,
      reactions: message.reactions,
    });
    return message;
  }

  private async requireAuthor(userId: string, messageId: string) {
    const existing = await this.prisma.message.findUnique({ where: { id: messageId }, include });
    if (!existing || existing.deletedAt) throw new NotFoundException('Message not found');
    await this.access.requireChannel(userId, existing.channelId);
    if (existing.authorId !== userId)
      throw new ForbiddenException('You can only edit your own messages');
    return existing;
  }

  private async serialize(row: Row, userId: string): Promise<MessageDto> {
    const reactions = this.reactions(row, userId);
    const mentions: MessageMention[] = row.mentions.map((mention) => ({
      userId: mention.userId,
      handle: mention.user.handle,
    }));
    const attachments: MessageAttachment[] = await Promise.all(
      row.attachments.map(async (attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url: row.deletedAt ? null : await this.uploads.presign(attachment.storageKey),
      })),
    );
    return {
      id: row.id,
      channelId: row.channelId,
      parentId: row.parentId,
      body: row.deletedAt ? '' : row.body,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      replyCount: row._count.replies,
      author: toPublicUser(row.author),
      reactions,
      mentions,
      attachments: row.deletedAt ? [] : attachments,
    };
  }

  private reactions(row: Row, userId: string): MessageReaction[] {
    const grouped = new Map<string, { count: number; reactedByMe: boolean; userIds: string[] }>();
    for (const reaction of row.reactions) {
      const current = grouped.get(reaction.emoji) ?? { count: 0, reactedByMe: false, userIds: [] };
      current.count += 1;
      current.userIds.push(reaction.userId);
      if (reaction.userId === userId) current.reactedByMe = true;
      grouped.set(reaction.emoji, current);
    }
    return [...grouped.entries()].map(([emoji, value]) => ({ emoji, ...value }));
  }
}
