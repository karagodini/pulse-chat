import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberDto, ServerEvent, WorkspaceDto } from '@pulse/shared';
import { randomBytes } from 'crypto';
import { AccessService } from '../common/access.service';
import { toSessionUser } from '../common/public-user';
import { ChannelsService } from '../channels/channels.service';
import { isUniqueViolation, slugify } from '../lib/text';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateInviteDto, CreateWorkspaceDto } from './dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly channels: ChannelsService,
    private readonly presence: PresenceService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(userId: string): Promise<WorkspaceDto[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { workspace: { name: 'asc' } },
    });
    return memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      description: membership.workspace.description,
      role: membership.role,
    }));
  }

  async create(userId: string, dto: CreateWorkspaceDto): Promise<WorkspaceDto> {
    const slug = await this.uniqueSlug(dto.name);
    try {
      const workspace = await this.prisma.workspace.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description?.trim() ?? '',
          memberships: { create: { userId, role: 'OWNER' } },
        },
      });
      await this.channels.createGeneral(userId, workspace.id);
      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        role: 'OWNER',
      };
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Choose a different workspace name');
      throw error;
    }
  }

  async members(userId: string, workspaceId: string): Promise<MemberDto[]> {
    await this.access.requireMembership(userId, workspaceId);
    const memberships = await this.prisma.membership.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });
    const presence = await this.presence.getMany(memberships.map((item) => item.userId));
    return memberships.map((item) => ({
      role: item.role,
      presence: presence[item.userId] ?? 'offline',
      user: toSessionUser(item.user),
    }));
  }

  async invite(userId: string, workspaceId: string, dto: CreateInviteDto) {
    await this.access.requireMembership(userId, workspaceId, ['OWNER', 'ADMIN']);
    const token = randomBytes(24).toString('base64url');
    const invite = await this.prisma.invite.create({
      data: {
        workspaceId,
        email: dto.email,
        role: dto.role ?? 'MEMBER',
        token,
        invitedById: userId,
        expiresAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    return {
      token: invite.token,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async acceptInvite(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');
    const invite = await this.prisma.invite.findUnique({ where: { token } });
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('This invite is no longer active');
    }
    if (invite.email !== user.email) {
      throw new BadRequestException('This invite was issued for a different email address');
    }
    await this.prisma.membership.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      create: { workspaceId: invite.workspaceId, userId, role: invite.role },
      update: {},
    });
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
    await this.channels.joinAllPublic(userId, invite.workspaceId);
    this.realtime.emitWorkspace(invite.workspaceId, ServerEvent.directoryChanged, {
      workspaceId: invite.workspaceId,
    });
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: invite.workspaceId },
    });
    return { workspaceId: workspace.id, name: workspace.name };
  }

  private async uniqueSlug(name: string) {
    const base = slugify(name);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const found = await this.prisma.workspace.findUnique({ where: { slug } });
      if (!found) return slug;
    }
    return `${base}-${randomBytes(2).toString('hex')}`;
  }
}
