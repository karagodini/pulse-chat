import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChannelDto, MemberDto, WorkspaceDto } from '@pulse/shared';
import { FormEvent, ReactNode, useState } from 'react';
import { api } from '../lib/api';
import { previewText } from '../lib/format';
import { useToasts } from '../lib/stores';
import { Avatar } from './Avatar';

export function Sidebar({
  workspace,
  channels,
  members,
  activeId,
  onSelect,
  onSearch,
}: {
  workspace: WorkspaceDto;
  channels: ChannelDto[];
  members: MemberDto[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onSearch: () => void;
}) {
  const rooms = channels.filter((channel) => channel.kind === 'CHANNEL');
  const directs = channels.filter((channel) => channel.kind === 'DIRECT');
  const [dialog, setDialog] = useState<'channel' | 'direct' | 'invite' | null>(null);

  return (
    <aside className="sidebar">
      <div className="side-top">
        <div>
          <p className="eyebrow">{workspace.slug}</p>
          <h2>{workspace.name}</h2>
        </div>
        <button type="button" onClick={onSearch}>
          Search
        </button>
      </div>
      <p className="workspace-note">{workspace.description}</p>
      <section className="side-section">
        <header>
          <span>Channels</span>
          <button type="button" onClick={() => setDialog('channel')} aria-label="Create channel">
            +
          </button>
        </header>
        {rooms.map((channel) => (
          <ChannelButton
            key={channel.id}
            channel={channel}
            active={channel.id === activeId}
            onSelect={onSelect}
          />
        ))}
      </section>
      <section className="side-section">
        <header>
          <span>Direct messages</span>
          <button type="button" onClick={() => setDialog('direct')} aria-label="New direct message">
            +
          </button>
        </header>
        {directs.map((channel) => (
          <ChannelButton
            key={channel.id}
            channel={channel}
            active={channel.id === activeId}
            onSelect={onSelect}
          />
        ))}
      </section>
      {(workspace.role === 'OWNER' || workspace.role === 'ADMIN') && (
        <button type="button" className="text-button" onClick={() => setDialog('invite')}>
          Invite a teammate
        </button>
      )}
      {dialog === 'channel' && (
        <ChannelDialog
          workspaceId={workspace.id}
          onClose={() => setDialog(null)}
          onCreated={onSelect}
        />
      )}
      {dialog === 'direct' && (
        <DirectDialog
          workspaceId={workspace.id}
          members={members}
          onClose={() => setDialog(null)}
          onCreated={onSelect}
        />
      )}
      {dialog === 'invite' && (
        <InviteDialog workspaceId={workspace.id} onClose={() => setDialog(null)} />
      )}
    </aside>
  );
}

function ChannelButton({
  channel,
  active,
  onSelect,
}: {
  channel: ChannelDto;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const prefix = channel.kind === 'DIRECT' ? '' : channel.isPrivate ? '🔒' : '#';
  return (
    <button
      type="button"
      className={`channel-link ${active ? 'active' : ''}`}
      onClick={() => onSelect(channel.id)}
    >
      <span className="channel-name">
        {channel.kind === 'DIRECT' && channel.peer ? (
          <Avatar name={channel.peer.name} color={channel.peer.avatarColor} size="sm" />
        ) : (
          <span className="hash">{prefix}</span>
        )}
        <strong>{channel.name}</strong>
      </span>
      {channel.unreadCount > 0 && <em className="badge">{channel.unreadCount}</em>}
      {channel.lastMessage && (
        <small>{previewText(channel.lastMessage.body, channel.lastMessage.authorName)}</small>
      )}
    </button>
  );
}

function ChannelDialog({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const push = useToasts((state) => state.push);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      api<ChannelDto>(`/api/workspaces/${workspaceId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name, topic, isPrivate }),
      }),
    onSuccess: (channel) => {
      void queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] });
      onCreated(channel.id);
      onClose();
    },
    onError: (error: Error) => push(error.message),
  });

  return (
    <Dialog title="New channel" onClose={onClose} onSubmit={() => create.mutate()}>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="launch"
          required
        />
      </label>
      <label>
        Topic
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="What this channel is for"
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => setIsPrivate(event.target.checked)}
        />
        Private channel
      </label>
      <button type="submit" className="primary" disabled={create.isPending}>
        Create channel
      </button>
    </Dialog>
  );
}

function DirectDialog({
  workspaceId,
  members,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  members: MemberDto[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const push = useToasts((state) => state.push);
  const open = useMutation({
    mutationFn: (userId: string) =>
      api<ChannelDto>(`/api/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (channel) => {
      void queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] });
      onCreated(channel.id);
      onClose();
    },
    onError: (error: Error) => push(error.message),
  });

  return (
    <Dialog title="Direct message" onClose={onClose}>
      <ul className="people-list">
        {members.map((member) => (
          <li key={member.user.id}>
            <button type="button" onClick={() => open.mutate(member.user.id)}>
              <Avatar
                name={member.user.name}
                color={member.user.avatarColor}
                presence={member.presence}
                size="sm"
              />
              <span>
                <strong>{member.user.name}</strong>
                <small>{member.user.title}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function InviteDialog({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const push = useToasts((state) => state.push);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const invite = useMutation({
    mutationFn: () =>
      api<{ token: string }>(`/api/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    onSuccess: (result) => {
      setLink(`${window.location.origin}/invite/${result.token}`);
    },
    onError: (error: Error) => push(error.message),
  });

  return (
    <Dialog title="Invite" onClose={onClose} onSubmit={() => invite.mutate()}>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <button type="submit" className="primary" disabled={invite.isPending}>
        Create invite link
      </button>
      {link && (
        <p className="invite-link">
          Send this link. It expires in 14 days.
          <code>{link}</code>
        </p>
      )}
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  children: ReactNode;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit?.();
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="dialog" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </form>
    </div>
  );
}
