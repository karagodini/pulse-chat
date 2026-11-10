import { PresenceStatus } from '@pulse/shared';
import { initials } from '../lib/format';

export function Avatar({
  name,
  color,
  presence,
  size = 'md',
}: {
  name: string;
  color: string;
  presence?: PresenceStatus;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`avatar size-${size}`} style={{ background: color }} aria-hidden="true">
      {initials(name)}
      {presence && presence !== 'offline' && <i className={`presence ${presence}`} />}
    </span>
  );
}
