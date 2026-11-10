export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ChannelKind = 'CHANNEL' | 'DIRECT';
export type PresenceStatus = 'online' | 'away' | 'offline';

export const ALLOWED_REACTIONS = ['👍', '❤️', '😄', '🎉', '👀', '🚀'] as const;
export type ReactionEmoji = (typeof ALLOWED_REACTIONS)[number];

export const ServerEvent = {
  messageCreated: 'message.created',
  messageUpdated: 'message.updated',
  messageDeleted: 'message.deleted',
  reactionUpdated: 'reaction.updated',
  typing: 'typing',
  presence: 'presence',
  directoryChanged: 'directory.changed',
} as const;

export const ClientEvent = {
  typingStart: 'typing.start',
  typingStop: 'typing.stop',
  presenceHeartbeat: 'presence.heartbeat',
  presenceSet: 'presence.set',
  roomJoin: 'room.join',
} as const;

export type PublicUser = {
  id: string;
  name: string;
  handle: string;
  title: string;
  statusText: string;
  avatarColor: string;
};

export type SessionUser = PublicUser & {
  email: string;
};

export type MessageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string | null;
};

export type MessageReaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
};

export type MessageMention = {
  userId: string;
  handle: string;
};

export type MessageDto = {
  id: string;
  channelId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyCount: number;
  author: PublicUser;
  reactions: MessageReaction[];
  mentions: MessageMention[];
  attachments: MessageAttachment[];
};

export type ChannelPreview = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
};

export type ChannelDto = {
  id: string;
  workspaceId: string;
  name: string;
  topic: string;
  kind: ChannelKind;
  isPrivate: boolean;
  unreadCount: number;
  lastMessage: ChannelPreview | null;
  peer: PublicUser | null;
  memberIds: string[];
};

export type WorkspaceDto = {
  id: string;
  name: string;
  slug: string;
  description: string;
  role: WorkspaceRole;
};

export type MemberDto = {
  role: WorkspaceRole;
  presence: PresenceStatus;
  user: SessionUser;
};

export type SearchHit = {
  message: MessageDto;
  channel: {
    id: string;
    name: string;
    kind: ChannelKind;
    isPrivate: boolean;
  };
};

export type MessagesPage = {
  items: MessageDto[];
  nextCursor: string | null;
};

export type TypingEvent = {
  channelId: string;
  userId: string;
  active: boolean;
};

export type PresenceEvent = {
  userId: string;
  status: PresenceStatus;
};
