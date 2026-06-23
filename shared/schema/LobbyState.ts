import { Schema, type, MapSchema } from '@colyseus/schema';

export class LobbyPlayerState extends Schema {
  @type('string') username = '';
}

export class LobbyState extends Schema {
  @type({ map: LobbyPlayerState }) players = new MapSchema<LobbyPlayerState>();
}
