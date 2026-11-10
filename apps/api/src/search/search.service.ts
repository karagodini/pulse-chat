import { BadRequestException, Injectable } from '@nestjs/common';
import { SearchHit } from '@pulse/shared';
import { AccessService } from '../common/access.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly messages: MessagesService,
  ) {}

  async search(userId: string, workspaceId: string, q: string | undefined): Promise<SearchHit[]> {
    await this.access.requireMembership(userId, workspaceId);
    const query = q?.trim() ?? '';
    if (query.length < 2) throw new BadRequestException('Search needs at least two characters');
    if (query.length > 80) throw new BadRequestException('Search is limited to 80 characters');

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        channelId: string;
        name: string;
        kind: 'CHANNEL' | 'DIRECT';
        isPrivate: boolean;
      }>
    >`
      SELECT m.id, c.id AS "channelId", c.name, c.kind, c."isPrivate" AS "isPrivate"
      FROM "Message" m
      INNER JOIN "Channel" c ON c.id = m."channelId"
      WHERE c."workspaceId" = ${workspaceId}
        AND m."deletedAt" IS NULL
        AND to_tsvector('english', m.body) @@ plainto_tsquery('english', ${query})
        AND (
          (c."isPrivate" = false AND c.kind = 'CHANNEL')
          OR EXISTS (
            SELECT 1 FROM "ChannelMember" cm
            WHERE cm."channelId" = c.id AND cm."userId" = ${userId}
          )
        )
      ORDER BY ts_rank(to_tsvector('english', m.body), plainto_tsquery('english', ${query})) DESC,
               m."createdAt" DESC
      LIMIT 30
    `;

    const hits: SearchHit[] = [];
    for (const row of rows) {
      const message = await this.messages.get(userId, row.id);
      const channel =
        row.kind === 'DIRECT'
          ? await this.directLabel(row.channelId, userId)
          : { id: row.channelId, name: row.name, kind: row.kind, isPrivate: row.isPrivate };
      hits.push({ message, channel });
    }
    return hits;
  }

  private async directLabel(channelId: string, userId: string) {
    const members = await this.prisma.channelMember.findMany({
      where: { channelId },
      include: { user: true },
    });
    const peer = members.find((member) => member.userId !== userId)?.user;
    return {
      id: channelId,
      name: peer?.name ?? 'Direct message',
      kind: 'DIRECT' as const,
      isPrivate: true,
    };
  }
}
