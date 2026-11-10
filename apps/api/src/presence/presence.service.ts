import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PresenceStatus } from '@pulse/shared';
import { createClient, RedisClientType } from 'redis';

const TTL_SECONDS = 45;

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private clientPromise: Promise<RedisClientType> | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy() {
    if (!this.clientPromise) return;
    const client = await this.clientPromise.catch(() => null);
    if (client?.isOpen) await client.quit();
  }

  private client(): Promise<RedisClientType> {
    if (!this.clientPromise) {
      const url = this.config.getOrThrow<string>('REDIS_URL');
      const client = createClient({ url });
      client.on('error', (error) => this.logger.warn(error.message));
      this.clientPromise = client.connect().then(
        () => client as RedisClientType,
        (error) => {
          this.clientPromise = null;
          throw error;
        },
      );
    }
    return this.clientPromise;
  }

  async ping(): Promise<'ok'> {
    const redis = await this.client();
    const reply = await redis.ping();
    if (reply !== 'PONG') throw new Error('redis ping failed');
    return 'ok';
  }

  async connect(userId: string, socketId: string) {
    const redis = await this.client();
    await redis.sAdd(this.socketsKey(userId), socketId);
    await redis.set(this.statusKey(userId), 'online', { EX: TTL_SECONDS });
  }

  async touch(userId: string) {
    const redis = await this.client();
    const current = await redis.get(this.statusKey(userId));
    await redis.set(this.statusKey(userId), current === 'away' ? 'away' : 'online', {
      EX: TTL_SECONDS,
    });
  }

  async setStatus(userId: string, status: 'online' | 'away') {
    const redis = await this.client();
    await redis.set(this.statusKey(userId), status, { EX: TTL_SECONDS });
  }

  async disconnect(userId: string, socketId: string): Promise<PresenceStatus> {
    const redis = await this.client();
    await redis.sRem(this.socketsKey(userId), socketId);
    const remaining = await redis.sCard(this.socketsKey(userId));
    if (remaining === 0) {
      await redis.del(this.statusKey(userId));
      await redis.del(this.socketsKey(userId));
      return 'offline';
    }
    const status = await redis.get(this.statusKey(userId));
    return status === 'away' ? 'away' : 'online';
  }

  async getMany(userIds: string[]): Promise<Record<string, PresenceStatus>> {
    const result: Record<string, PresenceStatus> = {};
    if (userIds.length === 0) return result;
    const redis = await this.client();
    const values = await redis.mGet(userIds.map((id) => this.statusKey(id)));
    userIds.forEach((id, index) => {
      const value = values[index];
      result[id] = value === 'online' || value === 'away' ? value : 'offline';
    });
    return result;
  }

  private statusKey(userId: string) {
    return `presence:status:${userId}`;
  }

  private socketsKey(userId: string) {
    return `presence:sockets:${userId}`;
  }
}
