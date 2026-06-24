import * as THREE from 'three';
import { MAP_PALETTE } from '../../shared/level/mapPalette';
import {
  computeDronePose,
  generateDroneConfigs,
  type DroneConfig,
} from '../../shared/world/droneSimulation';

interface DroneAgent {
  root: THREE.Group;
  propellers: THREE.Group[];
  config: DroneConfig;
}

function createStyledMesh(geometry: THREE.BufferGeometry, color: number): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
  group.add(mesh);

  const edges = new THREE.EdgesGeometry(geometry);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
  group.add(line);

  return group;
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

export class DroneField {
  readonly group = new THREE.Group();
  private readonly agents: DroneAgent[];

  constructor() {
    this.agents = generateDroneConfigs().map((config) => {
      const { root, propellers } = createDroneVisual();
      return { root, propellers, config };
    });

    for (const agent of this.agents) {
      this.group.add(agent.root);
    }
  }

  update(worldTime: number): void {
    for (const agent of this.agents) {
      const pose = computeDronePose(agent.config, worldTime);
      agent.root.position.set(pose.x, pose.y, pose.z);
      agent.root.rotation.y = pose.yaw;
      agent.root.rotation.z = pose.bank;

      for (let i = 0; i < agent.propellers.length; i++) {
        agent.propellers[i]!.rotation.y = pose.propellerSpin * (i % 2 === 0 ? 1 : -1);
      }
    }
  }
}
