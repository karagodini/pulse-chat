import { User } from '@prisma/client';
import { PublicUser, SessionUser } from '@pulse/shared';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    title: user.title,
    statusText: user.statusText,
    avatarColor: user.avatarColor,
  };
}

export function toSessionUser(user: User): SessionUser {
  return { ...toPublicUser(user), email: user.email };
}
