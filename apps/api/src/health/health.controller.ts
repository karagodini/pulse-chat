import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PresenceService } from '../presence/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  @Public()
  @Get('health')
  async health() {
    let database = 'ok';
    let redis = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    try {
      await this.presence.ping();
    } catch {
      redis = 'down';
    }
    const body = {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      instance: process.env.INSTANCE_ID ?? 'local',
      database,
      redis,
      time: new Date().toISOString(),
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
