export interface GameInviteMessage {
  inviteId: string;
  roomId: string;
  fromUsername: string;
}

export interface GameInviteSentMessage {
  toUsername: string;
  roomId: string;
  inviteId: string;
}

export interface GameInviteAcceptedMessage {
  inviteId: string;
  username: string;
}

export interface GameInviteDeclinedMessage {
  inviteId: string;
  username: string;
}

export interface GameInviteCancelledMessage {
  inviteId: string;
}

export interface GameLaunchMessage {
  roomId: string;
  teamId?: number;
  mapId?: string;
  gameMode?: string;
}

/** Sent when the client asks for a pending party launch but none exists. */
export interface GameLaunchNoneMessage {
  _none: true;
}

export interface RequestGameLaunchMessage {
  _request?: true;
}

export interface SendGameInviteMessage {
  targetUsername?: string;
  targetUserId?: string;
}

export interface RespondGameInviteMessage {
  inviteId: string;
  fromUsername: string;
  accepted: boolean;
}

export interface StartGameInviteMessage {
  inviteId?: string;
  partyId?: string;
  friendlyFire?: boolean;
  mapId?: string;
  gameMode?: string;
}
