import * as THREE from 'three';
import type { ProjectileSpawnMessage } from '../../shared/network/projectile';
import type { WeaponId } from '../../shared/content/weaponIds';
import { isWeaponId } from '../../shared/content/weaponIds';
import { getWeaponConfig } from '../content/weaponConfig';
import type { MuzzleFlashConfig } from '../../shared/content/weaponConfig';
import type { Player } from '../player/Player';
import type { ProjectileSpawnParams } from './Projectile';
import { PROJECTILE_SPAWN_OFFSET, PROJECTILE_SPEED } from './projectileConfig';

const _direction = new THREE.Vector3();
const _visualOrigin = new THREE.Vector3();
const _hitRayOrigin = new THREE.Vector3();

export interface RemoteProjectileSpawn {
  params: ProjectileSpawnParams;
  weaponId: WeaponId;
  boltColors?: readonly [number, number, number];
  muzzleFlash?: MuzzleFlashConfig;
  projectileStyle?: 'bolt' | 'bioLiquid';
  projectileGravity?: number;
}

/** Build dummy tracer spawn data for a remote player's shot. */
export function buildRemoteProjectileSpawn(
  spawn: ProjectileSpawnMessage,
  shooter: Player | undefined,
): RemoteProjectileSpawn | null {
  _direction.set(spawn.dirX, spawn.dirY, spawn.dirZ);
  if (_direction.lengthSq() < 1e-8) return null;
  _direction.normalize();

  const weaponId =
    spawn.weaponId && isWeaponId(spawn.weaponId) ? spawn.weaponId : 'plasma_rifle';
  const weaponConfig = getWeaponConfig(weaponId);

  if (shooter?.readActiveMuzzleWorldPosition(_visualOrigin, weaponId)) {
    _hitRayOrigin.copy(_visualOrigin).addScaledVector(_direction, PROJECTILE_SPAWN_OFFSET);
  } else {
    _visualOrigin.set(spawn.x, spawn.y, spawn.z);
    _hitRayOrigin.copy(_visualOrigin).addScaledVector(_direction, PROJECTILE_SPAWN_OFFSET);
  }

  return {
    params: {
      hitRayOrigin: _hitRayOrigin.clone(),
      hitRayDirection: _direction.clone(),
      visualOrigin: _visualOrigin.clone(),
      speed: weaponConfig?.projectileSpeed ?? PROJECTILE_SPEED,
    },
    weaponId,
    boltColors: weaponConfig?.muzzleFlash?.colors,
    muzzleFlash: weaponConfig?.muzzleFlash,
    projectileStyle: weaponConfig?.projectileStyle,
    projectileGravity: weaponConfig?.projectileGravity,
  };
}
