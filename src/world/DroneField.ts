import * as THREE from 'three';
import { createDroneMesh } from '../content/droneModel';
import {
  computeDronePose,
  DEFAULT_DRONE_LOOK_RESPONSE,
  DRONE_MOVEMENT_SCALE,
  generateDroneConfigs,
  isDroneObserved,
  type DroneConfig,
  type DroneLookResponseConfig,
  type DronePose,
} from '../../shared/world/droneSimulation';

const _cameraPos = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();

interface DroneAgent {
  root: THREE.Group;
  config: DroneConfig;
  lastPose: DronePose;
  wasInAudioView: boolean;
  escapeVelocityX: number;
  escapeVelocityY: number;
  escapeVelocityZ: number;
  escapeOffsetX: number;
  escapeOffsetY: number;
  escapeOffsetZ: number;
  escapeBank: number;
}

/** FBX drone visual (`dron.fbx` is a single baked mesh — no separate helix pivots). */
export function createDroneVisual(): { root: THREE.Group; propellers: THREE.Group[] } {
  const root = createDroneMesh();
  return { root, propellers: [] };
}

function triggerEscapeImpulse(
  agent: DroneAgent,
  cameraX: number,
  cameraZ: number,
  droneX: number,
  droneZ: number,
  response: DroneLookResponseConfig,
): void {
  const toDroneX = droneX - cameraX;
  const toDroneZ = droneZ - cameraZ;
  const dist = Math.hypot(toDroneX, toDroneZ) || 1;

  const sideX = -toDroneZ / dist;
  const sideZ = toDroneX / dist;
  const side = agent.config.spinDir;

  agent.escapeVelocityX += sideX * side * response.escapeLateralSpeed;
  agent.escapeVelocityZ += sideZ * side * response.escapeLateralSpeed;
  agent.escapeVelocityY += response.escapeVerticalSpeed;
  agent.escapeBank = side * response.escapeBank;
}

export class DroneField {
  readonly group = new THREE.Group();
  private readonly agents: DroneAgent[];
  private readonly lookResponse: DroneLookResponseConfig;
  private anyInAudioView = false;

  constructor(lookResponse: DroneLookResponseConfig = DEFAULT_DRONE_LOOK_RESPONSE) {
    this.lookResponse = lookResponse;
    this.agents = generateDroneConfigs().map((config) => {
      const { root } = createDroneVisual();
      const lastPose = computeDronePose(config, 0);
      return {
        root,
        config,
        lastPose,
        wasInAudioView: false,
        escapeVelocityX: 0,
        escapeVelocityY: 0,
        escapeVelocityZ: 0,
        escapeOffsetX: 0,
        escapeOffsetY: 0,
        escapeOffsetZ: 0,
        escapeBank: 0,
      };
    });

    for (const agent of this.agents) {
      this.group.add(agent.root);
    }
  }

  update(worldTime: number, camera?: THREE.Camera, delta = 0.016): void {
    this.anyInAudioView = false;
    let cameraReady = false;
    if (camera) {
      camera.getWorldPosition(_cameraPos);
      camera.getWorldDirection(_cameraForward);
      cameraReady = true;
    }

    const {
      maxDistance,
      lookAngleDeg,
      escapeDamping,
      escapeReturn,
    } = this.lookResponse;
    const velocityDamp = Math.exp(-escapeDamping * delta);
    const offsetReturn = Math.exp(-escapeReturn * delta);

    for (const agent of this.agents) {
      let inAudioView = false;
      if (cameraReady) {
        inAudioView = isDroneObserved(
          _cameraPos.x,
          _cameraPos.y,
          _cameraPos.z,
          _cameraForward.x,
          _cameraForward.y,
          _cameraForward.z,
          agent.lastPose.x,
          agent.lastPose.y,
          agent.lastPose.z,
          maxDistance,
          lookAngleDeg,
        );
      }

      if (inAudioView && !agent.wasInAudioView) {
        triggerEscapeImpulse(
          agent,
          _cameraPos.x,
          _cameraPos.z,
          agent.lastPose.x,
          agent.lastPose.z,
          this.lookResponse,
        );
      }
      agent.wasInAudioView = inAudioView;
      if (inAudioView) {
        this.anyInAudioView = true;
      }

      agent.escapeOffsetX += agent.escapeVelocityX * delta;
      agent.escapeOffsetY += agent.escapeVelocityY * delta;
      agent.escapeOffsetZ += agent.escapeVelocityZ * delta;

      agent.escapeVelocityX *= velocityDamp;
      agent.escapeVelocityY *= velocityDamp;
      agent.escapeVelocityZ *= velocityDamp;

      agent.escapeOffsetX *= offsetReturn;
      agent.escapeOffsetY *= offsetReturn;
      agent.escapeOffsetZ *= offsetReturn;

      agent.escapeBank *= velocityDamp;

      const patrol = computeDronePose(agent.config, worldTime, DRONE_MOVEMENT_SCALE);
      const escapeSpeed = Math.hypot(agent.escapeVelocityX, agent.escapeVelocityZ);
      const x = patrol.x + agent.escapeOffsetX;
      const y = patrol.y + agent.escapeOffsetY;
      const z = patrol.z + agent.escapeOffsetZ;

      agent.lastPose = {
        x,
        y,
        z,
        yaw:
          escapeSpeed > 1.2
            ? Math.atan2(agent.escapeVelocityX, agent.escapeVelocityZ)
            : patrol.yaw,
        bank: patrol.bank + agent.escapeBank,
        propellerSpin: patrol.propellerSpin * (1 + Math.min(escapeSpeed / 12, 1.8)),
      };

      agent.root.position.set(x, y, z);
      // FBX drone keeps a fixed orientation — no yaw/bank spin while orbiting.
      agent.root.rotation.set(0, 0, 0);
    }
  }

  hasAnyInAudioView(): boolean {
    return this.anyInAudioView;
  }

  hasDroneInView(
    camera: THREE.Camera,
    _worldTime: number,
    maxDistance: number,
    lookAngleDeg: number,
  ): boolean {
    camera.getWorldPosition(_cameraPos);
    camera.getWorldDirection(_cameraForward);

    for (const agent of this.agents) {
      const pose = agent.lastPose;
      if (
        isDroneObserved(
          _cameraPos.x,
          _cameraPos.y,
          _cameraPos.z,
          _cameraForward.x,
          _cameraForward.y,
          _cameraForward.z,
          pose.x,
          pose.y,
          pose.z,
          maxDistance,
          lookAngleDeg,
        )
      ) {
        return true;
      }
    }

    return false;
  }
}
