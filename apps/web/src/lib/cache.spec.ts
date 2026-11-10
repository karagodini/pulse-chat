import { MessageDto } from '@pulse/shared';
import { describe, expect, it } from 'vitest';
import { flattenMessages, noteReply, upsertMessage, type MessageCache } from './cache';

function message(partial: Partial<MessageDto> & Pick<MessageDto, 'id' | 'body'>): MessageDto {
  return {
    channelId: 'c1',
    parentId: null,
    createdAt: '2026-11-10T15:00:00.000Z',
    editedAt: null,
    deletedAt: null,
    replyCount: 0,
    author: {
      id: 'u1',
      name: 'Ada Lovelace',
      handle: 'ada',
      title: 'Engineering',
      statusText: '',
      avatarColor: '#ff4d2e',
    },
    reactions: [],
    mentions: [],
    attachments: [],
    ...partial,
  };
}

describe('message cache', () => {
  it('appends a message once and replaces a pending id', () => {
    const initial: MessageCache = {
      pages: [{ items: [message({ id: 'm1', body: 'Earlier' })], nextCursor: null }],
      pageParams: [null],
    };
    const pending = message({ id: 'pending-1', body: 'Shipping the read path' });
    const withPending = upsertMessage(initial, pending);
    const saved = message({ id: 'm2', body: 'Shipping the read path' });
    const withSaved = upsertMessage(withPending, saved, 'pending-1');
    const again = upsertMessage(withSaved, saved);
    expect(flattenMessages(again).map((item) => item.id)).toEqual(['m1', 'm2']);
  });

  it('counts a thread reply a single time', () => {
    const initial: MessageCache = {
      pages: [
        { items: [message({ id: 'root', body: 'Cursor note', replyCount: 1 })], nextCursor: null },
      ],
      pageParams: [null],
    };
    const reply = message({ id: 'r1', body: 'Agreed', parentId: 'root' });
    const once = noteReply(initial, reply);
    const twice = noteReply(once, reply);
    expect(flattenMessages(twice)[0].replyCount).toBe(2);
  });
});
