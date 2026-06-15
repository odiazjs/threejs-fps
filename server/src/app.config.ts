import { defineServer, defineRoom } from 'colyseus';
import { FpsRoom } from './rooms/FpsRoom.js';

export const server = defineServer({
  rooms: {
    fps: defineRoom(FpsRoom),
  },
});

export default server;
