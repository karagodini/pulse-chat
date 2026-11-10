import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const databaseUrl = process.env.DATABASE_URL;
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.replace(/^\//, '') : '';
const run = databaseUrl && databaseName.endsWith('test') ? describe : describe.skip;

run('Pulse API', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "Reaction",
        "Mention",
        "Attachment",
        "Message",
        "ChannelMember",
        "Channel",
        "Invite",
        "Membership",
        "RefreshToken",
        "User",
        "Workspace"
      RESTART IDENTITY CASCADE
    `);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('registers, rotates a refresh token, and rejects a reused one', async () => {
    const agent = request.agent(app.getHttpServer());
    const created = await agent.post('/api/auth/register').send({
      email: 'ada@kepler.io',
      password: 'battery-staple-horse',
      name: 'Ada Lovelace',
      handle: 'ada',
    });
    expect(created.status).toBe(201);
    expect(created.body.accessToken).toEqual(expect.any(String));
    expect(created.headers['set-cookie']?.[0]).toContain('pulse_refresh');

    const refreshed = await agent.post('/api/auth/refresh').send({});
    expect(refreshed.status).toBe(200);
    const me = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`);
    expect(me.body.handle).toBe('ada');

    const reused = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookiePair(created.headers['set-cookie']));
    expect(reused.status).toBe(401);
  });

  it('keeps private channels closed and finds a public message', async () => {
    const ada = await login('ada@kepler.io');
    const grace = await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'grace@kepler.io',
      password: 'battery-staple-horse',
      name: 'Grace Hopper',
      handle: 'grace',
    });
    expect(grace.status).toBe(201);
    const graceToken = grace.body.accessToken as string;

    const workspace = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ada}`)
      .send({ name: 'Analytical Engines', description: 'Notes from the floor' });
    expect(workspace.status).toBe(201);

    const invite = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspace.body.id}/invites`)
      .set('Authorization', `Bearer ${ada}`)
      .send({ email: 'grace@kepler.io' });
    expect(invite.status).toBe(201);
    const accepted = await request(app.getHttpServer())
      .post(`/api/invites/${invite.body.token}/accept`)
      .set('Authorization', `Bearer ${graceToken}`);
    expect(accepted.status).toBe(201);

    const channels = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.body.id}/channels`)
      .set('Authorization', `Bearer ${ada}`);
    const general = channels.body.find((channel: { name: string }) => channel.name === 'general');
    const posted = await request(app.getHttpServer())
      .post(`/api/channels/${general.id}/messages`)
      .set('Authorization', `Bearer ${ada}`)
      .send({ body: 'The gear train should stay quieter than the room' });
    expect(posted.status).toBe(201);

    const reply = await request(app.getHttpServer())
      .post(`/api/channels/${general.id}/messages`)
      .set('Authorization', `Bearer ${ada}`)
      .send({ body: 'Leaving the note in the thread.', parentId: posted.body.id });
    expect(reply.status).toBe(201);
    const thread = await request(app.getHttpServer())
      .get(`/api/channels/${general.id}/messages`)
      .query({ parentId: posted.body.id })
      .set('Authorization', `Bearer ${graceToken}`);
    expect(thread.body.items).toHaveLength(1);

    const found = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.body.id}/search`)
      .query({ q: 'gear train' })
      .set('Authorization', `Bearer ${graceToken}`);
    expect(found.status).toBe(200);
    expect(
      found.body.some((hit: { message: { id: string } }) => hit.message.id === posted.body.id),
    ).toBe(true);

    const edited = await request(app.getHttpServer())
      .patch(`/api/messages/${posted.body.id}`)
      .set('Authorization', `Bearer ${graceToken}`)
      .send({ body: 'I should not be able to rewrite this' });
    expect(edited.status).toBe(403);

    const reaction = await request(app.getHttpServer())
      .post(`/api/messages/${posted.body.id}/reactions`)
      .set('Authorization', `Bearer ${graceToken}`)
      .send({ emoji: '👀' });
    expect(reaction.status).toBe(201);
    expect(reaction.body.reactions[0].emoji).toBe('👀');

    const removed = await request(app.getHttpServer())
      .delete(`/api/messages/${posted.body.id}`)
      .set('Authorization', `Bearer ${ada}`);
    expect(removed.status).toBe(200);
    const afterDelete = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspace.body.id}/search`)
      .query({ q: 'gear train' })
      .set('Authorization', `Bearer ${ada}`);
    expect(afterDelete.body).toHaveLength(0);

    const privateChannel = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspace.body.id}/channels`)
      .set('Authorization', `Bearer ${ada}`)
      .send({ name: 'leadership', isPrivate: true, topic: 'Staff notes' });
    expect(privateChannel.status).toBe(201);
    const denied = await request(app.getHttpServer())
      .get(`/api/channels/${privateChannel.body.id}/messages`)
      .set('Authorization', `Bearer ${graceToken}`);
    expect(denied.status).toBe(403);

    const direct = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspace.body.id}/conversations`)
      .set('Authorization', `Bearer ${ada}`)
      .send({ userId: grace.body.user.id });
    expect(direct.status).toBe(201);
    expect(direct.body.kind).toBe('DIRECT');
    const again = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspace.body.id}/conversations`)
      .set('Authorization', `Bearer ${graceToken}`)
      .send({ userId: (await me(ada)).id });
    expect(again.body.id).toBe(direct.body.id);

    const health = await request(app.getHttpServer()).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.database).toBe('ok');
    expect(health.body.redis).toBe('ok');
  });

  function cookiePair(header: string | string[] | undefined) {
    const raw = Array.isArray(header) ? header[0] : header;
    return raw?.split(';')[0] ?? '';
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'battery-staple-horse' });
    expect(response.status).toBe(200);
    return response.body.accessToken as string;
  }

  async function me(token: string) {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    return response.body as { id: string };
  }
});
