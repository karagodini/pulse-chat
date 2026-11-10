import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient, WorkspaceRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join } from 'path';

const password = process.env.SEED_USER_PASSWORD ?? '';
if (password.length < 10) {
  throw new Error('Set SEED_USER_PASSWORD to at least 10 characters before seeding');
}

const prisma = new PrismaClient();

const people: Array<{
  handle: string;
  name: string;
  email: string;
  title: string;
  statusText: string;
  avatarColor: string;
  role: WorkspaceRole;
}> = [
  {
    handle: 'amira',
    name: 'Amira Hassan',
    email: 'amira@kepler.io',
    title: 'Product',
    statusText: 'In the Thursday review',
    avatarColor: '#ff4d2e',
    role: 'OWNER',
  },
  {
    handle: 'theo',
    name: 'Theo Marchetti',
    email: 'theo@kepler.io',
    title: 'Engineering',
    statusText: 'Holding the read path',
    avatarColor: '#6aa6ff',
    role: 'ADMIN',
  },
  {
    handle: 'naomi',
    name: 'Naomi Brooks',
    email: 'naomi@kepler.io',
    title: 'Design',
    statusText: 'At the type bench',
    avatarColor: '#d38bfe',
    role: 'MEMBER',
  },
  {
    handle: 'caleb',
    name: 'Caleb Ortiz',
    email: 'caleb@kepler.io',
    title: 'Platform',
    statusText: 'Debouncing presence',
    avatarColor: '#3dce8a',
    role: 'MEMBER',
  },
  {
    handle: 'ingrid',
    name: 'Ingrid Solberg',
    email: 'ingrid@kepler.io',
    title: 'Customer success',
    statusText: 'With Northstar this week',
    avatarColor: '#e6b450',
    role: 'MEMBER',
  },
];

type Line = {
  channel: string;
  author: string;
  body: string;
  minutesAgo: number;
  key?: string;
  parentKey?: string;
  edited?: boolean;
  deleted?: boolean;
  attachment?: boolean;
  reactions?: Array<{ emoji: string; handles: string[] }>;
};

const lines: Line[] = [
  {
    channel: 'general',
    author: 'amira',
    minutesAgo: 240,
    body: 'Morning. The Q4 forecast board is the only thing on the board this week. If it slips, the November review slips with it.',
    reactions: [
      { emoji: '🚀', handles: ['theo'] },
      { emoji: '👀', handles: ['ingrid'] },
    ],
  },
  {
    channel: 'general',
    author: 'theo',
    minutesAgo: 232,
    body: "API for the board is in review. I'll land the read path today and keep writes behind the existing draft endpoint.",
  },
  {
    channel: 'general',
    author: 'ingrid',
    minutesAgo: 220,
    body: "Northstar asked if they can export the board to a spreadsheet before Thursday's finance sync. I told them we're close, not ready.",
  },
  {
    channel: 'general',
    author: 'amira',
    minutesAgo: 210,
    body: "@ingrid Tell them Thursday is a walkthrough, not a handoff. We'll send the export the following Monday.",
  },
  {
    channel: 'general',
    author: 'caleb',
    minutesAgo: 200,
    body: 'Ignore, this belongs in engineering.',
    deleted: true,
  },
  {
    channel: 'general',
    author: 'naomi',
    minutesAgo: 188,
    body: 'I pinned the empty state we want when a team has no forecast yet. It is in #design.',
  },
  {
    channel: 'design',
    author: 'naomi',
    minutesAgo: 180,
    body: 'The empty state should not apologize. "No forecast yet" and a single action, "Start from last quarter".',
    reactions: [{ emoji: '❤️', handles: ['amira'] }],
  },
  {
    channel: 'design',
    author: 'caleb',
    minutesAgo: 170,
    body: 'Can the action live in the header too? People miss the center of a quiet page.',
  },
  {
    channel: 'design',
    author: 'naomi',
    minutesAgo: 160,
    key: 'frame',
    attachment: true,
    body: 'Yes. Header action stays, the center is the explanation. Frame attached.',
  },
  {
    channel: 'design',
    author: 'amira',
    minutesAgo: 150,
    body: 'This is the one. Ship the quieter version, the one without the illustration of a person shrugging.',
  },
  {
    channel: 'design',
    author: 'naomi',
    minutesAgo: 142,
    body: 'Agreed. Shrugging illustrations are how products sound unsure of themselves.',
  },
  {
    channel: 'engineering',
    author: 'theo',
    minutesAgo: 130,
    edited: true,
    body: "Read path for the forecast board is up on staging. Pagination is cursor-based. Don't offset this table, it will drift while finance is still typing.",
  },
  {
    channel: 'engineering',
    author: 'caleb',
    minutesAgo: 118,
    key: 'cursor',
    body: "I'll put the note about the cursor format in a thread so we don't invent a second one next month.",
  },
  {
    channel: 'engineering',
    author: 'theo',
    minutesAgo: 110,
    parentKey: 'cursor',
    body: 'Cursor is the record time plus id, opaque to the client. If we change the sort, we change the token, not the contract.',
  },
  {
    channel: 'engineering',
    author: 'caleb',
    minutesAgo: 104,
    parentKey: 'cursor',
    body: "I'll mirror that on the board endpoint. Same shape: items, then nextCursor.",
  },
  {
    channel: 'engineering',
    author: 'theo',
    minutesAgo: 98,
    parentKey: 'cursor',
    body: 'And unread stays a count, not a second list.',
  },
  {
    channel: 'engineering',
    author: 'amira',
    minutesAgo: 80,
    body: "@theo @caleb If staging looks right after lunch I'll invite the Northstar admin to click through. No deck.",
  },
  {
    channel: 'engineering',
    author: 'caleb',
    minutesAgo: 46,
    body: "Presence on the board still flickers when a laptop sleeps. I'll debounce the away state so a closed lid doesn't look like someone left the company.",
  },
  {
    channel: 'engineering',
    author: 'theo',
    minutesAgo: 34,
    body: 'Redis holds presence with a short TTL. If an instance dies, the key expires and the avatar goes quiet on its own.',
    reactions: [{ emoji: '👍', handles: ['caleb', 'naomi'] }],
  },
  {
    channel: 'engineering',
    author: 'naomi',
    minutesAgo: 22,
    body: "Please don't make the away color red. Amber is enough.",
  },
  {
    channel: 'customers',
    author: 'ingrid',
    minutesAgo: 90,
    body: "Northstar's admin, Helen Cho, will be on the Thursday call. She cares about audit history more than the chart.",
  },
  {
    channel: 'customers',
    author: 'amira',
    minutesAgo: 78,
    body: 'Then we show the revision list first and the chart second.',
  },
  {
    channel: 'customers',
    author: 'theo',
    minutesAgo: 70,
    body: 'Revisions are stored. I can show who changed the forecast and when. A visual diff is not this week.',
  },
  {
    channel: 'customers',
    author: 'ingrid',
    minutesAgo: 60,
    body: "A list is what she asked for. Don't overbuild it before Thursday.",
  },
  {
    channel: 'dm:amira:theo',
    author: 'theo',
    minutesAgo: 50,
    body: "I'm a little worried the export promise is doing more work than the feature.",
  },
  {
    channel: 'dm:amira:theo',
    author: 'amira',
    minutesAgo: 40,
    body: "That's why it ships Monday, not Thursday. If it's ugly, we slip it and say so on the call.",
  },
  {
    channel: 'dm:amira:theo',
    author: 'theo',
    minutesAgo: 28,
    body: "Good. I'd rather show a smaller thing that feels finished.",
  },
  {
    channel: 'dm:caleb:naomi',
    author: 'caleb',
    minutesAgo: 36,
    body: "The header action you want is a button, not a link. I'll match the primary style.",
  },
  {
    channel: 'dm:caleb:naomi',
    author: 'naomi',
    minutesAgo: 24,
    body: 'Thank you. The label is "Start from last quarter", not "Create".',
  },
];

async function main() {
  const existing = await prisma.workspace.findUnique({ where: { slug: 'kepler' } });
  if (existing) {
    console.log('Kepler is already seeded.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const users = new Map<string, { id: string }>();
  for (const person of people) {
    const user = await prisma.user.create({
      data: {
        email: person.email,
        handle: person.handle,
        name: person.name,
        passwordHash,
        title: person.title,
        statusText: person.statusText,
        avatarColor: person.avatarColor,
      },
    });
    users.set(person.handle, user);
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Kepler',
      slug: 'kepler',
      description: 'Revenue intelligence for finance teams who would rather be right than loud.',
      memberships: {
        create: people.map((person) => ({
          userId: users.get(person.handle)!.id,
          role: person.role,
        })),
      },
    },
  });

  const everyone = people.map((person) => users.get(person.handle)!.id);
  const channelDefs = [
    {
      key: 'general',
      name: 'general',
      topic: 'Company-wide notes. Decisions live here.',
      isPrivate: false,
      kind: 'CHANNEL' as const,
      members: everyone,
    },
    {
      key: 'design',
      name: 'design',
      topic: 'Interface, language, and the moments between screens.',
      isPrivate: false,
      kind: 'CHANNEL' as const,
      members: everyone,
    },
    {
      key: 'engineering',
      name: 'engineering',
      topic: 'Build notes, incidents, and the shape of the system.',
      isPrivate: false,
      kind: 'CHANNEL' as const,
      members: everyone,
    },
    {
      key: 'customers',
      name: 'customers',
      topic: 'Renewals, risks, and what we heard this week.',
      isPrivate: true,
      kind: 'CHANNEL' as const,
      members: ['amira', 'ingrid', 'theo'].map((handle) => users.get(handle)!.id),
    },
    {
      key: 'dm:amira:theo',
      name: `dm:${[users.get('amira')!.id, users.get('theo')!.id].sort().join(':')}`,
      topic: '',
      isPrivate: true,
      kind: 'DIRECT' as const,
      members: ['amira', 'theo'].map((handle) => users.get(handle)!.id),
    },
    {
      key: 'dm:caleb:naomi',
      name: `dm:${[users.get('caleb')!.id, users.get('naomi')!.id].sort().join(':')}`,
      topic: '',
      isPrivate: true,
      kind: 'DIRECT' as const,
      members: ['caleb', 'naomi'].map((handle) => users.get(handle)!.id),
    },
  ];

  const channels = new Map<string, string>();
  const now = Date.now();
  const ago = (minutes: number) => new Date(now - minutes * 60_000);
  for (const definition of channelDefs) {
    const channel = await prisma.channel.create({
      data: {
        workspaceId: workspace.id,
        name: definition.name,
        topic: definition.topic,
        kind: definition.kind,
        isPrivate: definition.isPrivate,
        createdById: users.get('amira')!.id,
        members: {
          create: definition.members.map((userId) => ({
            userId,
            lastReadAt: new Date(now + 60_000),
          })),
        },
      },
    });
    channels.set(definition.key, channel.id);
  }

  await prisma.channelMember.update({
    where: {
      channelId_userId: {
        channelId: channels.get('engineering')!,
        userId: users.get('amira')!.id,
      },
    },
    data: { lastReadAt: ago(50) },
  });
  await prisma.channelMember.update({
    where: {
      channelId_userId: {
        channelId: channels.get('customers')!,
        userId: users.get('amira')!.id,
      },
    },
    data: { lastReadAt: ago(200) },
  });

  const created = new Map<string, string>();
  const ordered = [...lines].sort((a, b) => b.minutesAgo - a.minutesAgo);
  for (const line of ordered) {
    const authorId = users.get(line.author)!.id;
    const handles = [...line.body.matchAll(/(?:^|\s)@([a-z][a-z0-9_]{2,20})\b/g)].map(
      (match) => match[1],
    );
    const message = await prisma.message.create({
      data: {
        channelId: channels.get(line.channel)!,
        authorId,
        parentId: line.parentKey ? created.get(line.parentKey) : undefined,
        body: line.deleted ? '' : line.body,
        createdAt: ago(line.minutesAgo),
        editedAt: line.edited ? ago(Math.max(line.minutesAgo - 6, 1)) : undefined,
        deletedAt: line.deleted ? ago(line.minutesAgo - 1) : undefined,
        mentions: {
          create: handles
            .map((handle) => users.get(handle))
            .filter((user): user is { id: string } => Boolean(user))
            .map((user) => ({ userId: user.id })),
        },
      },
    });
    if (line.key) created.set(line.key, message.id);
    if (line.reactions) {
      for (const reaction of line.reactions) {
        for (const handle of reaction.handles) {
          await prisma.reaction.create({
            data: { messageId: message.id, userId: users.get(handle)!.id, emoji: reaction.emoji },
          });
        }
      }
    }
    if (line.attachment) {
      const storageKey = await storeSketch(authorId);
      if (storageKey) {
        await prisma.attachment.create({
          data: {
            messageId: message.id,
            uploadedBy: authorId,
            fileName: 'forecast-board.svg',
            mimeType: 'image/svg+xml',
            size: readFileSync(join(process.cwd(), 'prisma/assets/forecast-board.svg')).length,
            storageKey,
          },
        });
      }
    }
  }

  console.log('Seeded the Kepler workspace.');
}

async function storeSketch(authorId: string) {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.log('Object storage is not configured; the design frame was not uploaded.');
    return null;
  }
  const bucket = process.env.S3_BUCKET || 'pulse';
  const client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  const body = readFileSync(join(process.cwd(), 'prisma/assets/forecast-board.svg'));
  const key = `${authorId}/forecast-board.svg`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'image/svg+xml',
    }),
  );
  return key;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
