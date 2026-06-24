import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';
import { PLAYER_MAX_HP } from '../combat/damage.js';

export class PlayerState extends Schema {
  @type('string') username = 'Player';
  @type('number') teamId = 0;
  @type('number') hp = PLAYER_MAX_HP;
  @type('boolean') alive = true;
  @type('number') x = 0;
  @type('number') y = 1.6;
  @type('number') z = 0;
  @type('number') yaw = 0;
  @type('number') pitch = 0;
}

export class AmmoBoxState extends Schema {
  @type('number') x = 0;
  @type('number') z = 0;
  @type('boolean') collected = false;
}

export class FpsState extends Schema {
  @type('number') worldTime = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type([AmmoBoxState]) ammoBoxes = new ArraySchema<AmmoBoxState>();
}
