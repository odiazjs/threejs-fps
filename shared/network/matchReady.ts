/** Client → server: local assets/shaders are ready; match may start countdown. */
export const MATCH_CLIENT_READY_MESSAGE = 'matchClientReady' as const;

export interface MatchClientReadyMessage {
  type?: typeof MATCH_CLIENT_READY_MESSAGE;
}
