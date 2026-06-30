import 'dotenv/config';
import express from 'express';
import { defineServer, defineRoom } from 'colyseus';
import { applyApiCors } from './api/cors.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerFriendsRoutes } from './friends/routes.js';
import { registerMeRoutes } from './me/routes.js';
import { FpsRoom } from './rooms/FpsRoom.js';
import { LobbyRoom } from './rooms/LobbyRoom.js';

export const server = defineServer({
  rooms: {
    fps: defineRoom(FpsRoom),
    lobby: defineRoom(LobbyRoom),
  },
  express: (app) => {
    applyApiCors(app);
    app.use(express.json({ limit: '32kb' }));
    registerAuthRoutes(app);
    registerMeRoutes(app);
    registerFriendsRoutes(app);
  },
});

export default server;
