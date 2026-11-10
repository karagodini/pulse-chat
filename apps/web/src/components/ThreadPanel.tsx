import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MemberDto, MessageDto, MessagesPage } from '@pulse/shared';
import { api } from '../lib/api';
import { flattenMessages, type MessageCache } from '../lib/cache';
import { Composer } from './Composer';
import { MessageItem } from './MessageItem';

export function ThreadPanel({
  channelId,
  messageId,
  members,
  onClose,
}: {
  channelId: string;
  messageId: string;
  members: MemberDto[];
  onClose: () => void;
}) {
  const root = useQuery({
    queryKey: ['message', messageId],
    queryFn: () => api<MessageDto>(`/api/messages/${messageId}`),
  });
  const replies = useInfiniteQuery({
    queryKey: ['messages', channelId, messageId],
    queryFn: () =>
      api<MessagesPage>(
        `/api/channels/${channelId}/messages?parentId=${encodeURIComponent(messageId)}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const items = flattenMessages(replies.data as MessageCache | undefined);

  return (
    <aside className="thread">
      <header>
        <div>
          <p>Thread</p>
          <h2>{root.data?.replyCount ?? 0} replies</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close thread">
          Close
        </button>
      </header>
      <div className="thread-scroll">
        {root.data && (
          <MessageItem
            message={root.data}
            compact={false}
            members={members}
            onReply={() => undefined}
          />
        )}
        <div className="thread-replies">
          {items.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              compact={false}
              members={members}
              onReply={() => undefined}
            />
          ))}
        </div>
      </div>
      <Composer
        channelId={channelId}
        parentId={messageId}
        members={members}
        placeholder="Reply in thread"
      />
    </aside>
  );
}
