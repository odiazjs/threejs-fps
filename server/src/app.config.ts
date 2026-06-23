import { defineServer, defineRoom } from 'colyseus';
import { FpsRoom } from './rooms/FpsRoom.js';
import { LobbyRoom } from './rooms/LobbyRoom.js';

export const server = defineServer({
  rooms: {
    fps: defineRoom(FpsRoom),
    lobby: defineRoom(LobbyRoom),
  },
});

export default server;
