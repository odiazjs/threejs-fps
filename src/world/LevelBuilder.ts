import * as THREE from 'three';
import { mapGroup as kiloSectorMap } from '../../shared/level/kiloSectorLayout';
import { mapGroup as firingRangeMap } from '../../shared/level/firingRange';
import { getMapDef, normalizeMapId, type MapId } from '../../shared/level/maps';

/** Chrono-Bowl geometry (floor included) comes entirely from tdm_map.glb via TdmMap. */
const emptyTdmMapGroup = new THREE.Group();
emptyTdmMapGroup.name = 'tdm_map_level_placeholder';

export class LevelBuilder {
  build(mapId: MapId = 'kilo_sector') {
    const id = normalizeMapId(mapId);
    if (id === 'killhouse_small') return [emptyTdmMapGroup];
    if (id === 'firing_range') return [firingRangeMap];
    return [kiloSectorMap];
  }

  static getMapDef(mapId: MapId) {
    return getMapDef(mapId);
  }
}
