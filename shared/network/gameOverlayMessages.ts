/** Parent ↔ game iframe handshake (same origin). Join intent is never passed via URL. */

export const FPS_REQUEST_JOIN_INTENT_MESSAGE = 'fps-request-join-intent';
export const FPS_JOIN_INTENT_MESSAGE = 'fps-join-intent';

export interface GameJoinIntentPayload {
  roomId?: string;
  teamId?: number;
  mode: 'create' | 'join';
  mapId?: string;
  gameMode?: string;
}

export interface GameJoinIntentRequestMessage {
  type: typeof FPS_REQUEST_JOIN_INTENT_MESSAGE;
}

export interface GameJoinIntentResponseMessage {
  type: typeof FPS_JOIN_INTENT_MESSAGE;
  intent: GameJoinIntentPayload | null;
}
