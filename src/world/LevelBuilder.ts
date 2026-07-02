import { mapGroup as kiloSectorMap } from '../../shared/level/kiloSectorLayout';
import { mapGroup as killhouseSmallMap } from '../../shared/level/killhouse_small';
import { getMapDef, normalizeMapId, type MapId } from '../../shared/level/maps';

export class LevelBuilder {
  build(mapId: MapId = 'kilo_sector') {
    const mapGroup = normalizeMapId(mapId) === 'killhouse_small' ? killhouseSmallMap : kiloSectorMap;
    return [mapGroup];
  }

  static getMapDef(mapId: MapId) {
    return getMapDef(mapId);
  }
}
