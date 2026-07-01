import type { Scene, Vector3 } from 'three';
import * as THREE from 'three';
import { SHIELD_DOME_CHARGE_SEC } from '../../shared/combat/shieldDomeAbility';
import { ShieldDomeChargeFx } from '../effects/ShieldDomeChargeFx';

export interface ShieldDomeChargePlayerSync {
  sessionId: string;
  shieldDomeChargeEndAt: number;
  shieldDomeCenterX: number;
  shieldDomeCenterY: number;
  shieldDomeCenterZ: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface ActiveCharge {
  sessionId: string;
  chargeEndAt: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fx: ShieldDomeChargeFx;
  attachedToCamera: boolean;
}

const _cameraOrigin = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();
const _targetFeet = new THREE.Vector3();
const _targetWorld = new THREE.Vector3();

export class ShieldDomeChargeManager {
  private readonly charges: ActiveCharge[] = [];

  constructor(private readonly scene: Scene) {}

  syncFromPlayers(
    players: ShieldDomeChargePlayerSync[],
    worldTime: number,
    delta: number,
    localSessionId: string,
    localCamera: THREE.Camera | null,
  ): void {
    const activeIds = new Set<string>();

    for (const player of players) {
      if (player.shieldDomeChargeEndAt <= worldTime) continue;

      activeIds.add(player.sessionId);
      const isLocal = player.sessionId === localSessionId;
      this.ensureCharge(
        player.sessionId,
        player.shieldDomeChargeEndAt,
        player.shieldDomeCenterX,
        player.shieldDomeCenterY,
        player.shieldDomeCenterZ,
        isLocal,
        localCamera,
      );
    }

    for (let i = this.charges.length - 1; i >= 0; i--) {
      if (!activeIds.has(this.charges[i]!.sessionId)) {
        this.charges[i]!.fx.dispose();
        this.charges.splice(i, 1);
      }
    }

    for (const charge of this.charges) {
      const snapshot = players.find((p) => p.sessionId === charge.sessionId);
      if (!snapshot || snapshot.shieldDomeChargeEndAt <= worldTime) continue;

      const progress =
        1 -
        (snapshot.shieldDomeChargeEndAt - worldTime) / SHIELD_DOME_CHARGE_SEC;

      _targetFeet.set(charge.targetX, charge.targetY, charge.targetZ);

      if (charge.attachedToCamera && localCamera) {
        _targetWorld.copy(_targetFeet);
        charge.fx.updateCameraAttached(delta, localCamera, _targetWorld, progress);
        continue;
      }

      if (charge.sessionId === localSessionId && localCamera) {
        localCamera.updateMatrixWorld(true);
        localCamera.getWorldPosition(_cameraOrigin);
        localCamera.getWorldDirection(_cameraForward);
        _cameraOrigin.addScaledVector(_cameraForward, 0.35);
      } else {
        _cameraOrigin.set(snapshot.x, snapshot.y, snapshot.z);
        const cosPitch = Math.cos(snapshot.pitch);
        _cameraForward.set(
          -Math.sin(snapshot.yaw) * cosPitch,
          Math.sin(snapshot.pitch),
          -Math.cos(snapshot.yaw) * cosPitch,
        );
      }

      charge.fx.update(
        delta,
        _cameraOrigin,
        _cameraForward,
        _targetFeet,
        progress,
      );
    }
  }

  update(delta: number, worldTime: number): void {
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const charge = this.charges[i]!;
      if (worldTime >= charge.chargeEndAt) {
        charge.fx.dispose();
        this.charges.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const charge of this.charges) {
      charge.fx.dispose();
    }
    this.charges.length = 0;
  }

  private ensureCharge(
    sessionId: string,
    chargeEndAt: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    attachToCamera: boolean,
    localCamera: THREE.Camera | null,
  ): void {
    const existing = this.charges.find((charge) => charge.sessionId === sessionId);
    if (existing) {
      existing.chargeEndAt = chargeEndAt;
      existing.targetX = targetX;
      existing.targetY = targetY;
      existing.targetZ = targetZ;
      this.attachChargeFx(existing, attachToCamera, localCamera);
      return;
    }

    const fx = new ShieldDomeChargeFx();
    const charge: ActiveCharge = {
      sessionId,
      chargeEndAt,
      targetX,
      targetY,
      targetZ,
      fx,
      attachedToCamera: false,
    };
    this.attachChargeFx(charge, attachToCamera, localCamera);
    this.charges.push(charge);
  }

  private attachChargeFx(
    charge: ActiveCharge,
    attachToCamera: boolean,
    localCamera: THREE.Camera | null,
  ): void {
    charge.fx.object.removeFromParent();

    if (attachToCamera && localCamera) {
      localCamera.add(charge.fx.object);
      charge.fx.object.position.set(0, 0, 0);
      charge.fx.object.rotation.set(0, 0, 0);
      charge.attachedToCamera = true;
      return;
    }

    this.scene.add(charge.fx.object);
    charge.attachedToCamera = false;
  }
}
