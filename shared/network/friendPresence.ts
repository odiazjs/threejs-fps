export type FriendPresenceStatus = 'offline' | 'lobby' | 'menus' | 'game';

export interface FriendPresenceUpdate {
  userId: string;
  online: boolean;
  presence: FriendPresenceStatus;
}

export interface FriendPresenceSnapshotMessage {
  friends: FriendPresenceUpdate[];
}
