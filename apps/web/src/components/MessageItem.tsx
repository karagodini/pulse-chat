import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ALLOWED_REACTIONS, MemberDto, MessageDto } from '@pulse/shared';
import { useState } from 'react';
import { api } from '../lib/api';
import { fileSize, formatClock } from '../lib/format';
import { useAuth, useToasts } from '../lib/stores';
import { Avatar } from './Avatar';
import { RichText } from './RichText';

export function MessageItem({
  message,
  compact,
  members,
  onReply,
}: {
  message: MessageDto;
  compact: boolean;
  members: MemberDto[];
  onReply: (id: string) => void;
}) {
  const me = useAuth((state) => state.user);
  const push = useToasts((state) => state.push);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [confirming, setConfirming] = useState(false);
  const presence = members.find((member) => member.user.id === message.author.id)?.presence;
  const pending = message.id.startsWith('pending-');
  const mine = me?.id === message.author.id;

  const react = useMutation({
    mutationFn: (emoji: string) =>
      api<MessageDto>(`/api/messages/${message.id}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', message.channelId] });
    },
    onError: (error: Error) => push(error.message),
  });

  const save = useMutation({
    mutationFn: () =>
      api<MessageDto>(`/api/messages/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: draft }),
      }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['messages', message.channelId] });
    },
    onError: (error: Error) => push(error.message),
  });

  const remove = useMutation({
    mutationFn: () => api<MessageDto>(`/api/messages/${message.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', message.channelId] });
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
    onError: (error: Error) => push(error.message),
  });

  if (message.deletedAt) {
    return (
      <article className={`message removed ${compact ? 'compact' : ''}`}>
        {!compact && <span className="avatar ghost" />}
        <p>This message was removed.</p>
      </article>
    );
  }

  return (
    <article className={`message ${compact ? 'compact' : ''} ${pending ? 'pending' : ''}`}>
      {compact ? (
        <time>{formatClock(message.createdAt)}</time>
      ) : (
        <Avatar name={message.author.name} color={message.author.avatarColor} presence={presence} />
      )}
      <div className="message-main">
        {!compact && (
          <header>
            <strong>{message.author.name}</strong>
            <span>{message.author.title}</span>
            <time>{formatClock(message.createdAt)}</time>
            {message.editedAt && <em>Edited</em>}
          </header>
        )}
        {editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} />
            <div className="edit-actions">
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={save.isPending}>
                Save
              </button>
            </div>
          </form>
        ) : (
          message.body && <RichText text={message.body} />
        )}
        {message.attachments.length > 0 && (
          <div className="attachments">
            {message.attachments.map((file) =>
              file.mimeType.startsWith('image/') && file.url ? (
                <a
                  key={file.id}
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="image-file"
                >
                  <img src={file.url} alt={file.fileName} />
                </a>
              ) : (
                <a key={file.id} className="file-card" href={file.url ?? undefined}>
                  <strong>{file.fileName}</strong>
                  <span>{fileSize(file.size)}</span>
                </a>
              ),
            )}
          </div>
        )}
        {message.reactions.length > 0 && (
          <div className="reactions">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className={reaction.reactedByMe ? 'on' : ''}
                onClick={() => react.mutate(reaction.emoji)}
              >
                <span>{reaction.emoji}</span>
                {reaction.count}
              </button>
            ))}
          </div>
        )}
        {message.replyCount > 0 && !message.parentId && (
          <button type="button" className="thread-link" onClick={() => onReply(message.id)}>
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>
      {!pending && (
        <div className="message-actions">
          {ALLOWED_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => react.mutate(emoji)}
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          {!message.parentId && (
            <button type="button" onClick={() => onReply(message.id)}>
              Reply
            </button>
          )}
          {mine && (
            <button
              type="button"
              onClick={() => {
                setDraft(message.body);
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
          {mine && !confirming && (
            <button type="button" onClick={() => setConfirming(true)}>
              Remove
            </button>
          )}
          {confirming && (
            <button type="button" className="danger" onClick={() => remove.mutate()}>
              Confirm
            </button>
          )}
        </div>
      )}
    </article>
  );
}
