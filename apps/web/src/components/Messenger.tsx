import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChannelDto,
  ClientEvent,
  MemberDto,
  MessageDto,
  MessageReaction,
  PresenceEvent,
  PresenceStatus,
  ServerEvent,
  SessionUser,
  TypingEvent,
  WorkspaceDto,
} from '@pulse/shared';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  noteReply,
  patchMessage,
  patchReactions,
  upsertMessage,
  type MessageCache,
} from '../lib/cache';
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  joinChannel,
  updateSocketAuth,
} from '../lib/socket';
import { useAuth, useToasts, useUi } from '../lib/stores';
import { Avatar } from './Avatar';
import { MessagePane } from './MessagePane';
import { SearchModal } from './SearchModal';
import { Sidebar } from './Sidebar';
import { ThreadPanel } from './ThreadPanel';

export function Messenger() {
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user)!;
  const token = useAuth((state) => state.accessToken)!;
  const patchUser = useAuth((state) => state.patchUser);
  const clear = useAuth((state) => state.clear);
  const push = useToasts((state) => state.push);
  const workspaceId = useUi((state) => state.workspaceId);
  const channelId = useUi((state) => state.channelId);
  const threadId = useUi((state) => state.threadId);
  const searchOpen = useUi((state) => state.searchOpen);
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const setWorkspaceId = useUi((state) => state.setWorkspaceId);
  const setChannelId = useUi((state) => state.setChannelId);
  const setThreadId = useUi((state) => state.setThreadId);
  const setSearchOpen = useUi((state) => state.setSearchOpen);
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<Record<string, Record<string, number>>>({});
  const [profileOpen, setProfileOpen] = useState(false);

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspaceDto[]>('/api/workspaces'),
  });

  useEffect(() => {
    if (!workspaces.data?.length) return;
    if (!workspaceId || !workspaces.data.some((workspace) => workspace.id === workspaceId)) {
      setWorkspaceId(workspaces.data[0].id);
    }
  }, [workspaces.data, workspaceId, setWorkspaceId]);

  const channels = useQuery({
    queryKey: ['channels', workspaceId],
    queryFn: () => api<ChannelDto[]>(`/api/workspaces/${workspaceId}/channels`),
    enabled: Boolean(workspaceId),
  });
  const members = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => api<MemberDto[]>(`/api/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
    refetchInterval: 20000,
  });

  useEffect(() => {
    if (!channels.data?.length) return;
    if (!channelId || !channels.data.some((channel) => channel.id === channelId)) {
      const general = channels.data.find(
        (channel) => channel.kind === 'CHANNEL' && channel.name === 'general',
      );
      setChannelId((general ?? channels.data[0]).id);
    }
  }, [channels.data, channelId, setChannelId]);

  useEffect(() => {
    updateSocketAuth(token);
    const socket = connectSocket(token);
    const onConnect = () => {
      setConnected(true);
      const active = useUi.getState().channelId;
      if (active) joinChannel(active);
    };
    const onDisconnect = () => setConnected(false);
    const onCreated = (message: MessageDto) => {
      const normalized = withMe(message);
      const key = ['messages', normalized.channelId, normalized.parentId] as const;
      const existing = queryClient.getQueryData<MessageCache>(key);
      if (!existing) void queryClient.invalidateQueries({ queryKey: key });
      else queryClient.setQueryData<MessageCache>(key, upsertMessage(existing, normalized));
      if (normalized.parentId) {
        queryClient.setQueryData<MessageCache>(['messages', normalized.channelId, null], (cache) =>
          noteReply(cache, normalized),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    };
    const onUpdated = (message: MessageDto) => {
      const normalized = withMe(message);
      queryClient.setQueriesData<MessageCache>(
        { queryKey: ['messages', normalized.channelId] },
        (cache) => patchMessage(cache, normalized),
      );
      queryClient.setQueryData(['message', normalized.id], normalized);
    };
    const onDeleted = (message: MessageDto) => onUpdated(message);
    const onReaction = (payload: {
      messageId: string;
      channelId: string;
      reactions: MessageReaction[];
    }) => {
      const reactions = withMeReactions(payload.reactions);
      queryClient.setQueriesData<MessageCache>(
        { queryKey: ['messages', payload.channelId] },
        (cache) => patchReactions(cache, payload.messageId, reactions),
      );
    };
    const onTyping = (event: TypingEvent) => {
      setTyping((current) => {
        const channel = { ...(current[event.channelId] ?? {}) };
        if (event.active) channel[event.userId] = Date.now() + 2500;
        else delete channel[event.userId];
        return { ...current, [event.channelId]: channel };
      });
    };
    const onPresence = (event: PresenceEvent) => {
      queryClient.setQueryData<MemberDto[]>(['members', useUi.getState().workspaceId], (current) =>
        current?.map((member) =>
          member.user.id === event.userId ? { ...member, presence: event.status } : member,
        ),
      );
    };
    const onDirectory = () => {
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(ServerEvent.messageCreated, onCreated);
    socket.on(ServerEvent.messageUpdated, onUpdated);
    socket.on(ServerEvent.messageDeleted, onDeleted);
    socket.on(ServerEvent.reactionUpdated, onReaction);
    socket.on(ServerEvent.typing, onTyping);
    socket.on(ServerEvent.presence, onPresence);
    socket.on(ServerEvent.directoryChanged, onDirectory);
    const heartbeat = window.setInterval(() => {
      getSocket()?.emit(ClientEvent.presenceHeartbeat);
      setTyping((current) => {
        const next: typeof current = {};
        const now = Date.now();
        for (const [id, people] of Object.entries(current)) {
          const fresh = Object.fromEntries(
            Object.entries(people).filter(([, until]) => until > now),
          );
          if (Object.keys(fresh).length) next[id] = fresh;
        }
        return next;
      });
    }, 15000);
    const onVisibility = () => {
      const status: PresenceStatus = document.hidden ? 'away' : 'online';
      getSocket()?.emit(ClientEvent.presenceSet, { status });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(ServerEvent.messageCreated, onCreated);
      socket.off(ServerEvent.messageUpdated, onUpdated);
      socket.off(ServerEvent.messageDeleted, onDeleted);
      socket.off(ServerEvent.reactionUpdated, onReaction);
      socket.off(ServerEvent.typing, onTyping);
      socket.off(ServerEvent.presence, onPresence);
      socket.off(ServerEvent.directoryChanged, onDirectory);
      disconnectSocket();
    };
  }, [token, queryClient]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setThreadId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen, setThreadId]);

  const workspace = workspaces.data?.find((item) => item.id === workspaceId) ?? null;
  const channel = channels.data?.find((item) => item.id === channelId) ?? null;
  const typingUsers = useMemo(() => {
    if (!channelId || !members.data) return [];
    const active = typing[channelId] ?? {};
    const now = Date.now();
    return members.data
      .filter((member) => member.user.id !== user.id && (active[member.user.id] ?? 0) > now)
      .map((member) => member.user);
  }, [channelId, members.data, typing, user.id]);

  useEffect(() => {
    const titleChannel = channel
      ? `${channel.kind === 'CHANNEL' ? '#' : ''}${channel.name}`
      : 'Pulse';
    document.title = workspace ? `${titleChannel} · ${workspace.name} · Pulse` : 'Pulse';
  }, [channel, workspace]);

  if (workspaces.isLoading) return <div className="boot">Pulse</div>;

  if (!workspaces.data?.length) {
    return <CreateWorkspace />;
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clear();
    disconnectSocket();
  }

  return (
    <div className={`shell ${threadId ? 'with-thread' : ''} ${sidebarOpen ? 'nav-open' : ''}`}>
      <aside className="rail">
        <div className="rail-marks">
          {workspaces.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === workspaceId ? 'active' : ''}
              onClick={() => setWorkspaceId(item.id)}
              title={item.name}
            >
              {item.name.slice(0, 1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="profile-button"
          onClick={() => setProfileOpen((open) => !open)}
        >
          <Avatar
            name={user.name}
            color={user.avatarColor}
            presence={connected ? 'online' : 'offline'}
          />
        </button>
        {profileOpen && (
          <ProfileCard
            user={user}
            connected={connected}
            onSave={async (statusText) => {
              const updated = await api<SessionUser>('/api/users/me', {
                method: 'PATCH',
                body: JSON.stringify({ statusText }),
              });
              patchUser(updated);
              setProfileOpen(false);
            }}
            onLogout={() => void logout()}
            onError={(message) => push(message)}
          />
        )}
      </aside>
      {workspace && (
        <Sidebar
          workspace={workspace}
          channels={channels.data ?? []}
          members={(members.data ?? []).filter((member) => member.user.id !== user.id)}
          activeId={channelId}
          onSelect={setChannelId}
          onSearch={() => setSearchOpen(true)}
        />
      )}
      {channel ? (
        <MessagePane
          channel={channel}
          members={members.data ?? []}
          typing={typingUsers}
          onReply={(id) => setThreadId(id)}
        />
      ) : (
        <section className="stage">
          <p className="empty">Choose a channel.</p>
        </section>
      )}
      {channel && threadId && (
        <ThreadPanel
          channelId={channel.id}
          messageId={threadId}
          members={members.data ?? []}
          onClose={() => setThreadId(null)}
        />
      )}
      <button type="button" className="nav-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        Channels
      </button>
      {searchOpen && workspaceId && (
        <SearchModal
          workspaceId={workspaceId}
          onClose={() => setSearchOpen(false)}
          onOpen={(nextChannel, parentId) => {
            setChannelId(nextChannel);
            setThreadId(parentId);
            setSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}

function withMe(message: MessageDto): MessageDto {
  return { ...message, reactions: withMeReactions(message.reactions) };
}

function withMeReactions(reactions: MessageReaction[]) {
  const userId = useAuth.getState().user?.id;
  return reactions.map((reaction) => ({
    ...reaction,
    userIds: reaction.userIds ?? [],
    reactedByMe: userId ? (reaction.userIds ?? []).includes(userId) : reaction.reactedByMe,
  }));
}

function CreateWorkspace() {
  const queryClient = useQueryClient();
  const push = useToasts((state) => state.push);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name, description }) });
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not create the workspace');
    }
  }

  return (
    <main className="create-workspace">
      <form onSubmit={onSubmit}>
        <p className="brand">Pulse</p>
        <h1>Name the workspace.</h1>
        <label>
          Workspace
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
          />
        </label>
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="submit" className="primary">
          Create workspace
        </button>
      </form>
    </main>
  );
}

function ProfileCard({
  user,
  connected,
  onSave,
  onLogout,
  onError,
}: {
  user: SessionUser;
  connected: boolean;
  onSave: (statusText: string) => Promise<void>;
  onLogout: () => void;
  onError: (message: string) => void;
}) {
  const [statusText, setStatusText] = useState(user.statusText);
  return (
    <form
      className="profile-card"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(statusText).catch((error: Error) => onError(error.message));
      }}
    >
      <strong>{user.name}</strong>
      <span>{user.title || 'Member'}</span>
      <span className="connection">{connected ? 'Connected' : 'Reconnecting'}</span>
      <label>
        Status
        <input
          value={statusText}
          maxLength={140}
          onChange={(event) => setStatusText(event.target.value)}
        />
      </label>
      <button type="submit" className="primary">
        Save status
      </button>
      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </form>
  );
}
