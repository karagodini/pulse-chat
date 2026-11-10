import { useQuery } from '@tanstack/react-query';
import { SearchHit } from '@pulse/shared';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatClock } from '../lib/format';

export function SearchModal({
  workspaceId,
  onOpen,
  onClose,
}: {
  workspaceId: string;
  onOpen: (channelId: string, parentId: string | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [value]);

  const results = useQuery({
    queryKey: ['search', workspaceId, query],
    queryFn: () =>
      api<SearchHit[]>(`/api/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="search-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Search messages"
      >
        <input
          autoFocus
          value={value}
          placeholder="Search messages"
          onChange={(event) => setValue(event.target.value)}
        />
        <ul>
          {query.length >= 2 && results.data?.length === 0 && (
            <li className="muted">No messages matched.</li>
          )}
          {results.data?.map((hit) => (
            <li key={hit.message.id}>
              <button type="button" onClick={() => onOpen(hit.channel.id, hit.message.parentId)}>
                <strong>
                  {hit.message.author.name}
                  <span>
                    {hit.channel.kind === 'DIRECT' ? hit.channel.name : `#${hit.channel.name}`} ·{' '}
                    {formatClock(hit.message.createdAt)}
                  </span>
                </strong>
                <p>{hit.message.body}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
