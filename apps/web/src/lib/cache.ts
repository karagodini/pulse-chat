import { MessageDto, MessageReaction, MessagesPage } from '@pulse/shared';

export type MessageCache = {
  pages: MessagesPage[];
  pageParams: unknown[];
};

const countedReplies = new Set<string>();

export function flattenMessages(cache: MessageCache | undefined) {
  if (!cache) return [];
  const seen = new Set<string>();
  const items: MessageDto[] = [];
  for (const page of [...cache.pages].reverse()) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

export function upsertMessage(
  cache: MessageCache | undefined,
  message: MessageDto,
  replaceId?: string,
): MessageCache | undefined {
  if (!cache) return cache;
  const pages = cache.pages.map((page, index) => {
    const items = page.items.filter((item) => item.id !== message.id && item.id !== replaceId);
    if (index === 0) items.push(message);
    return { ...page, items };
  });
  if (pages.length === 0) {
    return { ...cache, pages: [{ items: [message], nextCursor: null }] };
  }
  return { ...cache, pages };
}

export function patchMessage(cache: MessageCache | undefined, message: MessageDto) {
  if (!cache) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === message.id ? message : item)),
    })),
  };
}

export function patchReactions(
  cache: MessageCache | undefined,
  messageId: string,
  reactions: MessageReaction[],
) {
  if (!cache) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === messageId ? { ...item, reactions } : item)),
    })),
  };
}

export function noteReply(cache: MessageCache | undefined, message: MessageDto) {
  if (!cache || !message.parentId || countedReplies.has(message.id)) return cache;
  countedReplies.add(message.id);
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === message.parentId ? { ...item, replyCount: item.replyCount + 1 } : item,
      ),
    })),
  };
}

export function dropMessage(cache: MessageCache | undefined, messageId: string) {
  if (!cache) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== messageId),
    })),
  };
}
