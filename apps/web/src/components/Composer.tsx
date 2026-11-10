import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MemberDto, MessageAttachment, MessageDto } from '@pulse/shared';
import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { MessageCache, upsertMessage } from '../lib/cache';
import { emitTyping } from '../lib/socket';
import { useAuth, useToasts } from '../lib/stores';

export function Composer({
  channelId,
  parentId = null,
  members,
  placeholder,
}: {
  channelId: string;
  parentId?: string | null;
  members: MemberDto[];
  placeholder: string;
}) {
  const me = useAuth((state) => state.user);
  const push = useToasts((state) => state.push);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<MessageAttachment[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);
  const queryKey = ['messages', channelId, parentId] as const;

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return members
      .filter((member) => {
        const user = member.user;
        return user.handle.includes(query) || user.name.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [members, mentionQuery]);

  const send = useMutation({
    mutationFn: (payload: { body: string; attachmentIds: string[]; tmpId: string }) =>
      api<MessageDto>(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body: payload.body,
          parentId: parentId ?? undefined,
          attachmentIds: payload.attachmentIds,
        }),
      }),
    onMutate: async (payload) => {
      if (!me) return;
      const optimistic: MessageDto = {
        id: payload.tmpId,
        channelId,
        parentId,
        body: payload.body,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        replyCount: 0,
        author: me,
        reactions: [],
        mentions: [],
        attachments: files,
      };
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<MessageCache>(queryKey, (cache) => {
        if (!cache)
          return { pages: [{ items: [optimistic], nextCursor: null }], pageParams: [null] };
        return upsertMessage(cache, optimistic);
      });
    },
    onSuccess: (saved, payload) => {
      queryClient.setQueryData<MessageCache>(queryKey, (cache) =>
        upsertMessage(cache, saved, payload.tmpId),
      );
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
    onError: (error: Error, payload) => {
      queryClient.setQueryData<MessageCache>(queryKey, (cache) => {
        if (!cache) return cache;
        return {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== payload.tmpId),
          })),
        };
      });
      push(error.message);
    },
  });

  function submit() {
    const body = text.trim();
    if ((!body && files.length === 0) || send.isPending) return;
    const attachmentIds = files.map((file) => file.id);
    setText('');
    setFiles([]);
    setMentionQuery(null);
    emitTyping(channelId, false);
    send.mutate({ body, attachmentIds, tmpId: `pending-${crypto.randomUUID()}` });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape') setMentionQuery(null);
  }

  function onChange(value: string) {
    setText(value);
    const match = /(?:^|\s)@([a-z0-9_]*)$/i.exec(value);
    setMentionQuery(match ? match[1] : null);
    emitTyping(channelId, value.trim().length > 0);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => emitTyping(channelId, false), 1600);
  }

  function insertMention(handle: string) {
    setText((current) =>
      current.replace(/(?:^|\s)@([a-z0-9_]*)$/i, (token) => {
        const prefix = token.startsWith('@') ? '' : token[0];
        return `${prefix}@${handle} `;
      }),
    );
    setMentionQuery(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const uploaded = await api<MessageAttachment>('/api/uploads', { method: 'POST', body: form });
      setFiles((current) => [...current, uploaded]);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Upload failed');
    }
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      {suggestions.length > 0 && (
        <ul className="mentions">
          {suggestions.map((member) => (
            <li key={member.user.id}>
              <button type="button" onClick={() => insertMention(member.user.handle)}>
                <strong>{member.user.name}</strong>
                <span>@{member.user.handle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="pending-files">
          {files.map((file) => (
            <li key={file.id}>
              {file.fileName}
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
                aria-label="Remove file"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        value={text}
        rows={1}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-bar">
        <button type="button" onClick={() => fileRef.current?.click()}>
          Attach
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <span>Enter to send</span>
        <button type="submit" className="primary" disabled={send.isPending}>
          Send
        </button>
      </div>
    </form>
  );
}
