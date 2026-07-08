/** Seconds after throw before the grenade detonates. */
export const GRENADE_FUSE_SEC = 4;

/** Horizontal throw speed (m/s). */
export const GRENADE_THROW_SPEED = 40;

/** Upward velocity added on throw (m/s). */
export const GRENADE_THROW_UPWARD = 2.2;

/** World gravity applied to grenades (m/s²). */
export const GRENADE_GRAVITY = 34;

/** Linear air-drag coefficient — higher values feel heavier in flight. */
export const GRENADE_AIR_DRAG = 0.12;

/** Blast radius for damage falloff (m). */
export const GRENADE_BLAST_RADIUS = 6.00;

/** Damage at explosion center. */
export const GRENADE_MAX_DAMAGE = 150;

/** Grenades granted per world pickup stack. */
export const GRENADE_PICKUP_GRANT = 4;

/** Grenade pickup respawn delay (seconds). */
export const GRENADE_PICKUP_RESPAWN_SEC = 2;

/** Max distance from thrower eye to reported throw origin (m). */
export const GRENADE_THROW_ORIGIN_MAX_OFFSET = 1.15;

/** Hold position: fraction of half-viewport from screen center (X: + right / − left, Y: + down / − up). */
export const GRENADE_THROW_SCREEN_OFFSET_X = 0.48;
export const GRENADE_THROW_SCREEN_OFFSET_Y = 0.58;

/** Distance along the hold-screen ray to place the throw origin (m). */
export const GRENADE_THROW_ARM_DEPTH = 0.58;

/** Max angle between reported throw dir and player aim (radians). */
export const GRENADE_THROW_AIM_HALF_ANGLE_RAD = (55 * Math.PI) / 180;

/** Grenade mesh radius for ground collision (m). */
export const GRENADE_COLLISION_RADIUS = 0.14;

/** Ground bounce restitution (0–1). */
export const GRENADE_GROUND_RESTITUTION = 0.42;

/** Wall / prop bounce restitution (0–1). */
export const GRENADE_WALL_RESTITUTION = 0.46;

/** Horizontal speed retained per ground contact. */
export const GRENADE_GROUND_FRICTION = 0.66;

/** Speed below which the grenade stops bouncing and rolls to rest. */
export const GRENADE_ROLL_STOP_SPEED = 0.55;

/** Bounces allowed before the grenade is forced to rest. */
export const GRENADE_MAX_BOUNCES = 10;

/** Grace after the fuse before the server force-detonates a grenade whose
 *  thrower never reported a detonation position (disconnect / dropped message). */
export const GRENADE_SERVER_FALLBACK_GRACE_SEC = 0.75;

/** Max distance integrated per physics sub-step (m) — prevents tunneling through walls. */
export const GRENADE_MAX_PHYSICS_STEP = 0.09;

/** Max substeps per simulation tick. */
export const GRENADE_MAX_PHYSICS_SUBSTEPS = 10;
