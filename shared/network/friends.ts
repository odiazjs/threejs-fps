export interface FriendRequestMessage {
  requestId: string;
  fromUsername: string;
}

export interface FriendRequestResultMessage {
  requestId: string;
  username: string;
  accepted: boolean;
}

export interface FriendRequestSentMessage {
  toUsername: string;
}

export interface FriendRequestErrorMessage {
  message: string;
}

export interface SendFriendRequestMessage {
  targetUsername: string;
}

export interface RespondFriendRequestMessage {
  requestId: string;
  fromUsername: string;
  accepted: boolean;
}
