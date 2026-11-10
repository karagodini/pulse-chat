import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Channel, Membership, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMembership(
    userId: string,
    workspaceId: string,
    roles?: WorkspaceRole[],
  ): Promise<Membership> {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }
    if (roles && !roles.includes(membership.role)) {
      throw new ForbiddenException('You do not have permission to do that');
    }
    return membership;
  }

  async requireChannel(userId: string, channelId: string): Promise<Channel> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    await this.requireMembership(userId, channel.workspaceId);
    if (channel.isPrivate || channel.kind === 'DIRECT') {
      const member = await this.prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
      });
      if (!member) throw new ForbiddenException('This conversation is private');
    }
    return channel;
  }
}
