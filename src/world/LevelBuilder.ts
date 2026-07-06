import { mapGroup as kiloSectorMap } from '../../shared/level/kiloSectorLayout';
import { mapGroup as killhouseSmallMap } from '../../shared/level/killhouse_small';
import { mapGroup as firingRangeMap } from '../../shared/level/firingRange';
import { getMapDef, normalizeMapId, type MapId } from '../../shared/level/maps';

export class LevelBuilder {
  build(mapId: MapId = 'kilo_sector') {
    const id = normalizeMapId(mapId);
    if (id === 'killhouse_small') return [killhouseSmallMap];
    if (id === 'firing_range') return [firingRangeMap];
    return [kiloSectorMap];
  }

  static getMapDef(mapId: MapId) {
    return getMapDef(mapId);
  }
}
