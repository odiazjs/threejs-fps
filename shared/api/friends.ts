export interface FriendSummary {
  userId: string;
  displayName: string;
  email: string;
}

export interface FriendRequestSummary {
  id: string;
  fromUserId: string;
  fromDisplayName: string;
  fromEmail: string;
  toUserId: string;
  toDisplayName: string;
  toEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface FriendsListResponse {
  friends: FriendSummary[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
}

export interface FriendRequestResponse {
  request: FriendRequestSummary;
}

export interface FriendRespondResponse {
  request: FriendRequestSummary;
  friendship?: {
    friend: FriendSummary;
  };
}
