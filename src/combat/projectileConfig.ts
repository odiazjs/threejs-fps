export const PROJECTILE_SPEED = 475;
export const PROJECTILE_MAX_AGE = 3;
/** Cap live bolts — high enough for shotgun pellet volleys in flight. */
export const MAX_CONCURRENT_PROJECTILES = 36;
export const MAX_CONCURRENT_MUZZLE_FLASHES = 4;
export const MAX_CONCURRENT_SPLASHES = 12;
/** How far gameplay resolve raycasts (not full map span). */
export const RESOLVE_RAYCAST_MAX_DISTANCE = 96;
/** Open-air tracers die quickly so bolts don't stack for seconds. */
export const MISS_TRACER_MAX_FLIGHT_SEC = 0.28;
export const PROJECTILE_POOL_SIZE = 40;
export const MAX_AIM_DISTANCE = 1000;
export const HIT_SPLASH_WORLD_DURATION = 0.45;
export const HIT_SPLASH_PLAYER_DURATION = 0.6;
export const HIT_SPLASH_WORLD_SCALE = 1;
/** Visual size of spark points and debris chips (1 = default). */
export const HIT_SPLASH_PARTICLE_SCALE = 0.7;
/** @deprecated Use HIT_SPLASH_WORLD_DURATION */
export const HIT_SPLASH_DURATION = HIT_SPLASH_WORLD_DURATION;
/** Nudge spawn forward so the bolt clears the weapon. */
export const PROJECTILE_SPAWN_OFFSET = 0.08;
/** Keep the spawn point this far in front of the crosshair hit. */
export const PROJECTILE_SPAWN_MARGIN = 0.06;
/** Max distance moved per collision sub-step (legacy; projectiles now sweep per frame). */
export const PROJECTILE_MOVE_STEP = 0.05;
/** Ray origin skin — avoids zero-distance hits when grazing a surface. */
export const PROJECTILE_RAY_SKIN = 0.008;
