import { Schema, type, MapSchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('number') x = 0;
  @type('number') y = 1.6;
  @type('number') z = 0;
  @type('number') yaw = 0;
  @type('number') pitch = 0;
}

export class FpsState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
