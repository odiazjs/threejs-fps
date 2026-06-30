import type { FriendPresenceStatus } from '../../shared/network/friendPresence';

export function isInviteablePresence(presence: FriendPresenceStatus): boolean {
  return presence === 'lobby' || presence === 'menus';
}
