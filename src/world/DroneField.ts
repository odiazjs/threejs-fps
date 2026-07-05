import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import { createFlatKitMesh } from '../../shared/visuals/edgeLines.js';
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
  propellers: THREE.Group[];
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

function createStyledMesh(geometry: THREE.BufferGeometry, color: number): THREE.Group {
  return createFlatKitMesh(geometry, color);
}

function createPropeller(): THREE.Group {
  const spinner = new THREE.Group();

  const hub = createStyledMesh(
    new THREE.CylinderGeometry(0.05, 0.06, 0.05, 6),
    MAP_PALETTE.darkGunmetal,
  );
  hub.rotation.x = Math.PI / 2;
  spinner.add(hub);

  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3;
    const blade = createStyledMesh(
      new THREE.BoxGeometry(0.52, 0.025, 0.07),
      i === 0 ? MAP_PALETTE.neonCyan : MAP_PALETTE.steelGrey,
    );
    blade.rotation.y = angle;
    blade.position.set(Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2);
    spinner.add(blade);
  }

  const tip = createStyledMesh(
    new THREE.BoxGeometry(0.08, 0.03, 0.08),
    MAP_PALETTE.neonCyan,
  );
  tip.position.set(0.26, 0, 0);
  spinner.add(tip);

  return spinner;
}

function createDroneBody(): { body: THREE.Group; propellers: THREE.Group[] } {
  const body = new THREE.Group();
  const propellers: THREE.Group[] = [];

  const core = createStyledMesh(
    new THREE.BoxGeometry(0.42, 0.34, 0.42),
    MAP_PALETTE.ironGrey,
  );
  core.position.y = 0.02;
  body.add(core);

  const panelGeo = new THREE.BoxGeometry(0.34, 0.22, 0.05);
  for (const [x, z] of [
    [0, -0.24],
    [0, 0.24],
    [-0.24, 0],
    [0.24, 0],
  ] as const) {
    const panel = createStyledMesh(panelGeo, MAP_PALETTE.pastelOrange);
    panel.position.set(x, 0.04, z);
    body.add(panel);
  }

  const trim = createStyledMesh(
    new THREE.BoxGeometry(0.48, 0.07, 0.48),
    MAP_PALETTE.steelGrey,
  );
  trim.position.y = -0.04;
  body.add(trim);

  const plasmaRing = createStyledMesh(
    new THREE.BoxGeometry(0.5, 0.1, 0.5),
    MAP_PALETTE.pastelTeal,
  );
  plasmaRing.position.y = 0.18;
  body.add(plasmaRing);

  const cap = createStyledMesh(
    new THREE.BoxGeometry(0.38, 0.1, 0.38),
    MAP_PALETTE.steelGrey,
  );
  cap.position.y = 0.28;
  body.add(cap);

  const capCore = createStyledMesh(
    new THREE.BoxGeometry(0.18, 0.06, 0.18),
    MAP_PALETTE.neonCyan,
  );
  capCore.position.y = 0.36;
  body.add(capCore);

  const sensor = createStyledMesh(
    new THREE.BoxGeometry(0.12, 0.08, 0.16),
    MAP_PALETTE.neonCyan,
  );
  sensor.position.set(0, 0.02, -0.28);
  body.add(sensor);

  const armOffsets: [number, number][] = [
    [-0.46, -0.46],
    [0.46, -0.46],
    [-0.46, 0.46],
    [0.46, 0.46],
  ];

  for (const [ax, az] of armOffsets) {
    const arm = createStyledMesh(
      new THREE.BoxGeometry(0.42, 0.05, 0.07),
      MAP_PALETTE.carbonGrey,
    );
    arm.position.set(ax * 0.5, 0.06, az * 0.5);
    arm.rotation.y = Math.atan2(az, ax);
    body.add(arm);

    const spinner = createPropeller();
    spinner.position.set(ax, 0.1, az);
    body.add(spinner);
    propellers.push(spinner);
  }

  return { body, propellers };
}

export function createDroneVisual(): { root: THREE.Group; propellers: THREE.Group[] } {
  const root = new THREE.Group();
  const { body, propellers } = createDroneBody();
  root.add(body);
  root.scale.setScalar(0.85);
  return { root, propellers };
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
      const { root, propellers } = createDroneVisual();
      const lastPose = computeDronePose(config, 0);
      return {
        root,
        propellers,
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
      agent.root.rotation.y = agent.lastPose.yaw;
      agent.root.rotation.z = agent.lastPose.bank;

      for (let i = 0; i < agent.propellers.length; i++) {
        agent.propellers[i]!.rotation.y =
          agent.lastPose.propellerSpin * (i % 2 === 0 ? 1 : -1);
      }
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
