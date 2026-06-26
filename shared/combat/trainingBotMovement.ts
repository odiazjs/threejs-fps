export const TRAINING_BOT_WALK_SPEED = 2.5;
export const TRAINING_BOT_SPRINT_MULTIPLIER = 1.65;
export const TRAINING_BOT_WANDER_RADIUS = 14;

const IDLE_CHANCE = 0.22;
const SPRINT_CHANCE = 0.28;
const JUMP_CHANCE = 0.12;
const MIN_DECISION_SEC = 1.4;
const MAX_DECISION_SEC = 4.2;

export interface TrainingBotMoveState {
  moveYaw: number;
  moving: boolean;
  sprinting: boolean;
  jumpQueued: boolean;
  nextDecisionAt: number;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickWanderYaw(
  spawnX: number,
  spawnZ: number,
  botX: number,
  botZ: number,
): number {
  const dx = spawnX - botX;
  const dz = spawnZ - botZ;
  const dist = Math.hypot(dx, dz);

  if (dist > TRAINING_BOT_WANDER_RADIUS) {
    return Math.atan2(dx, dz) + randomRange(-0.35, 0.35);
  }

  return Math.random() * Math.PI * 2;
}

export function createTrainingBotMoveState(
  spawnYaw: number,
  worldTime: number,
): TrainingBotMoveState {
  return {
    moveYaw: spawnYaw,
    moving: true,
    sprinting: false,
    jumpQueued: false,
    nextDecisionAt: worldTime + randomRange(MIN_DECISION_SEC, MAX_DECISION_SEC),
  };
}

export function updateTrainingBotMoveState(
  state: TrainingBotMoveState,
  spawnX: number,
  spawnZ: number,
  botX: number,
  botZ: number,
  worldTime: number,
): TrainingBotMoveState {
  if (worldTime < state.nextDecisionAt) {
    return state;
  }

  const idle = Math.random() < IDLE_CHANCE;
  const moving = !idle;
  const sprinting = moving && Math.random() < SPRINT_CHANCE;
  const jumpQueued = moving && Math.random() < JUMP_CHANCE;

  return {
    moveYaw: moving ? pickWanderYaw(spawnX, spawnZ, botX, botZ) : state.moveYaw,
    moving,
    sprinting,
    jumpQueued,
    nextDecisionAt: worldTime + randomRange(MIN_DECISION_SEC, MAX_DECISION_SEC),
  };
}

export function computeTrainingBotMoveDelta(
  state: TrainingBotMoveState,
  deltaSec: number,
): { deltaX: number; deltaZ: number } {
  if (!state.moving) {
    return { deltaX: 0, deltaZ: 0 };
  }

  const speed =
    TRAINING_BOT_WALK_SPEED *
    (state.sprinting ? TRAINING_BOT_SPRINT_MULTIPLIER : 1);
  const dist = speed * deltaSec;

  return {
    deltaX: Math.sin(state.moveYaw) * dist,
    deltaZ: Math.cos(state.moveYaw) * dist,
  };
}
