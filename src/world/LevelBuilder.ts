import * as THREE from 'three';
import { mapGroup as firingRangeMap } from '../../shared/level/firingRange';
import { getMapDef, normalizeMapId, type MapId } from '../../shared/level/maps';

/** Chrono-Bowl / Harvest geometry comes entirely from their GLBs. */
const emptyTdmMapGroup = new THREE.Group();
emptyTdmMapGroup.name = 'tdm_map_level_placeholder';

const emptyHarvestMapGroup = new THREE.Group();
emptyHarvestMapGroup.name = 'harvest_map_level_placeholder';

export class LevelBuilder {
  build(mapId: MapId = 'firing_range') {
    const id = normalizeMapId(mapId);
    if (id === 'killhouse_small') return [emptyTdmMapGroup];
    if (id === 'harvest') return [emptyHarvestMapGroup];
    if (id === 'firing_range') return [firingRangeMap];
    return [emptyTdmMapGroup];
  }

  static getMapDef(mapId: MapId) {
    return getMapDef(mapId);
  }
}
