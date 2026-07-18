import 'dotenv/config';
import express from 'express';
import { defineServer, defineRoom } from 'colyseus';
import { applyApiCors } from './api/cors.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerCharacterRoutes } from './characters/routes.js';
import { registerFriendsRoutes } from './friends/routes.js';
import { registerLeaderboardRoutes } from './leaderboard/routes.js';
import { registerLoadoutRoutes } from './loadouts/routes.js';
import { registerMeRoutes } from './me/routes.js';
import { registerStoreRoutes } from './store/routes.js';
import { registerWeaponRoutes } from './weapons/routes.js';
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
    registerWeaponRoutes(app);
    registerLoadoutRoutes(app);
    registerStoreRoutes(app);
    registerCharacterRoutes(app);
    registerFriendsRoutes(app);
    registerLeaderboardRoutes(app);
  },
});

export default server;
