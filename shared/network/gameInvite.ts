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
  teamId: number;
}

export interface PrepareGameLaunchMessage {
  inviteId: string;
  teamId: number;
}

export interface SendGameInviteMessage {
  targetUsername: string;
}

export interface RespondGameInviteMessage {
  inviteId: string;
  fromUsername: string;
  accepted: boolean;
}

export interface StartGameInviteMessage {
  inviteId: string;
}

export interface ReportGameRoomMessage {
  inviteId: string;
  roomId: string;
}
