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
import {
  registerLemonSqueezyWebhookRoute,
  registerPaymentRoutes,
} from './payments/routes.js';
import { registerProgressionRoutes } from './progression/routes.js';
import { registerStoreRoutes } from './store/routes.js';
import { registerWeaponRoutes } from './weapons/routes.js';
import { registerWeaponUnlockableRoutes } from './weaponUnlockables/routes.js';
import { FpsRoom } from './rooms/FpsRoom.js';
import { LobbyRoom } from './rooms/LobbyRoom.js';

export const server = defineServer({
  rooms: {
    fps: defineRoom(FpsRoom),
    lobby: defineRoom(LobbyRoom),
  },
  express: (app) => {
    applyApiCors(app);
    // Raw body required for Lemon Squeezy HMAC — before express.json.
    registerLemonSqueezyWebhookRoute(app);
    app.use(express.json({ limit: '32kb' }));
    registerAuthRoutes(app);
    registerMeRoutes(app);
    registerPaymentRoutes(app);
    registerProgressionRoutes(app);
    registerWeaponRoutes(app);
    registerLoadoutRoutes(app);
    registerWeaponUnlockableRoutes(app);
    registerStoreRoutes(app);
    registerCharacterRoutes(app);
    registerFriendsRoutes(app);
    registerLeaderboardRoutes(app);
  },
});

export default server;
