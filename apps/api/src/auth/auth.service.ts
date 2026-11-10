import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { SessionUser } from '@pulse/shared';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { toSessionUser } from '../common/public-user';
import { colorForHandle } from '../lib/text';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

export type Session = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<Session> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { handle: dto.handle }] },
    });
    if (existing) {
      throw new ConflictException('An account with that email or handle already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        handle: dto.handle,
        name: dto.name,
        passwordHash,
        avatarColor: colorForHandle(dto.handle),
      },
    });
    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<Session> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedException('Email or password is incorrect');
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<Session> {
    const payload = await this.verifyRefresh(refreshToken);
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token was already used');
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    return this.issueSession(user);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return toSessionUser(user);
  }

  private async issueSession(user: User): Promise<Session> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('ACCESS_TOKEN_TTL') || '15m',
      },
    );
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') || 14);
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, typ: 'refresh', jti: randomBytes(16).toString('hex') },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: `${days}d`,
      },
    );
    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });
    return { accessToken, refreshToken, user: toSessionUser(user) };
  }

  private async verifyRefresh(token: string): Promise<{ sub: string }> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (!payload.sub || payload.typ !== 'refresh') throw new Error('wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
