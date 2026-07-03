export const PROJECTILE_SPEED = 475;
export const PROJECTILE_MAX_AGE = 3;
export const MAX_AIM_DISTANCE = 1000;
export const HIT_SPLASH_DURATION = 0.5;
/** Nudge spawn forward so the bolt clears the weapon. */
export const PROJECTILE_SPAWN_OFFSET = 0.08;
/** Keep the spawn point this far in front of the crosshair hit. */
export const PROJECTILE_SPAWN_MARGIN = 0.06;
/** Max distance moved per collision sub-step (legacy; projectiles now sweep per frame). */
export const PROJECTILE_MOVE_STEP = 0.05;
/** Ray origin skin — avoids zero-distance hits when grazing a surface. */
export const PROJECTILE_RAY_SKIN = 0.008;
