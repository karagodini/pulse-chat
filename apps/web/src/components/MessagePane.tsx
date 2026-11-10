import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChannelDto, MemberDto, MessagesPage, PublicUser } from '@pulse/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { flattenMessages, type MessageCache } from '../lib/cache';
import { formatDay } from '../lib/format';
import { joinChannel } from '../lib/socket';
import { Composer } from './Composer';
import { MessageItem } from './MessageItem';

type Row =
  | { key: string; kind: 'day'; label: string }
  | {
      key: string;
      kind: 'message';
      message: ReturnType<typeof flattenMessages>[number];
      compact: boolean;
    }
  | { key: string; kind: 'earlier' };

export function MessagePane({
  channel,
  members,
  typing,
  onReply,
}: {
  channel: ChannelDto;
  members: MemberDto[];
  typing: PublicUser[];
  onReply: (messageId: string) => void;
}) {
  const queryClient = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const readyRef = useRef(false);
  const [stuck, setStuck] = useState(true);

  const query = useInfiniteQuery({
    queryKey: ['messages', channel.id, null],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam);
      return api<MessagesPage>(`/api/channels/${channel.id}/messages?${params}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

  useEffect(() => {
    readyRef.current = false;
    stickRef.current = true;
    setStuck(true);
    joinChannel(channel.id);
    void api(`/api/channels/${channel.id}/read`, { method: 'POST' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['channels'] }))
      .catch(() => undefined);
  }, [channel.id, queryClient]);

  const messages = flattenMessages(query.data as MessageCache | undefined);
  const rows = useMemo(
    () => buildRows(messages, Boolean(query.hasNextPage)),
    [messages, query.hasNextPage],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) => (rows[index]?.kind === 'message' ? 92 : 44),
    overscan: 10,
  });

  useLayoutEffect(() => {
    if (!rows.length) return;
    if (!readyRef.current || stickRef.current) {
      virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
      readyRef.current = true;
    }
  }, [rows.length, channel.id, virtualizer]);

  const label =
    channel.kind === 'DIRECT' ? (channel.peer?.name ?? channel.name) : `#${channel.name}`;

  return (
    <section className="stage">
      <header className="stage-head">
        <div>
          <h1>{label}</h1>
          <p>{channel.topic || (channel.kind === 'DIRECT' ? 'Direct message' : 'No topic yet')}</p>
        </div>
        <div className="facepile" aria-label="People in this conversation">
          {members
            .filter((member) => channel.memberIds.includes(member.user.id))
            .slice(0, 6)
            .map((member) => (
              <span key={member.user.id} title={`${member.user.name} · ${member.presence}`}>
                <i className={`dot ${member.presence}`} />
                {member.user.name.split(' ')[0]}
              </span>
            ))}
        </div>
      </header>
      <div
        className="transcript"
        ref={scrollerRef}
        onScroll={() => {
          const element = scrollerRef.current;
          if (!element) return;
          const next = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
          stickRef.current = next;
          setStuck((current) => (current === next ? current : next));
        }}
      >
        {query.isLoading && <p className="empty">Opening the channel…</p>}
        {!query.isLoading && messages.length === 0 && (
          <p className="empty">A quiet channel. Say what the work needs.</p>
        )}
        <div className="transcript-inner" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={row.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="virtual-row"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {row.kind === 'earlier' && (
                  <button
                    type="button"
                    className="earlier"
                    onClick={() => void query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                  >
                    {query.isFetchingNextPage ? 'Loading' : 'Earlier messages'}
                  </button>
                )}
                {row.kind === 'day' && <div className="day-rule">{row.label}</div>}
                {row.kind === 'message' && (
                  <MessageItem
                    message={row.message}
                    compact={row.compact}
                    members={members}
                    onReply={onReply}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="composer-dock">
        {typing.length > 0 && (
          <p className="typing">
            {typing.map((person) => person.name.split(' ')[0]).join(', ')}{' '}
            {typing.length === 1 ? 'is typing' : 'are typing'}
          </p>
        )}
        {!stuck && rows.length > 0 && (
          <button
            type="button"
            className="jump"
            onClick={() => virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })}
          >
            Jump to latest
          </button>
        )}
        <Composer
          channelId={channel.id}
          members={members}
          placeholder={channel.kind === 'DIRECT' ? `Message ${label}` : `Message ${label}`}
        />
      </div>
    </section>
  );
}

function buildRows(messages: ReturnType<typeof flattenMessages>, hasMore: boolean): Row[] {
  const rows: Row[] = [];
  if (hasMore) rows.push({ key: 'earlier', kind: 'earlier' });
  let previousDay = '';
  let previousAuthor = '';
  let previousTime = 0;
  for (const message of messages) {
    const day = formatDay(message.createdAt);
    if (day !== previousDay) {
      rows.push({ key: `day-${day}-${message.id}`, kind: 'day', label: day });
      previousDay = day;
      previousAuthor = '';
    }
    const time = new Date(message.createdAt).getTime();
    const compact =
      previousAuthor === message.author.id &&
      time - previousTime < 5 * 60_000 &&
      !message.deletedAt;
    rows.push({ key: message.id, kind: 'message', message, compact });
    previousAuthor = message.author.id;
    previousTime = time;
  }
  return rows;
}
