export type FriendPresenceStatus = 'offline' | 'lobby' | 'game';

export interface FriendPresenceUpdate {
  userId: string;
  online: boolean;
  presence: FriendPresenceStatus;
}

export interface FriendPresenceSnapshotMessage {
  friends: FriendPresenceUpdate[];
}
