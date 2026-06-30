import { pgEnum } from 'drizzle-orm/pg-core';

export const friendRequestStatusEnum = pgEnum('friend_request_status', [
  'pending',
  'accepted',
  'declined',
]);
