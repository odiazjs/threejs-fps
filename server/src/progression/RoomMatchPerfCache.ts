import type { MatchPerformanceStats } from '../../../shared/content/matchRewards.js';
import { sanitizeMatchPerformance } from '../../../shared/content/matchRewards.js';

/** Server-room in-memory match performance (authoritative combat totals). */
export class RoomMatchPerfCache {
  private readonly bySession = new Map<string, MutablePerf>();

  reset(): void {
    this.bySession.clear();
  }

  ensure(sessionId: string): MutablePerf {
    let row = this.bySession.get(sessionId);
    if (!row) {
      row = createEmptyPerf();
      this.bySession.set(sessionId, row);
    }
    return row;
  }

  recordKill(sessionId: string): void {
    this.ensure(sessionId).kills += 1;
  }

  recordDeath(sessionId: string): void {
    this.ensure(sessionId).deaths += 1;
  }

  recordDamageDealt(sessionId: string, amount: number, headshot: boolean): void {
    const dmg = Math.max(0, amount);
    if (dmg <= 0) return;
    const row = this.ensure(sessionId);
    row.damageDealt += dmg;
    if (headshot) row.headshotDamage += dmg;
  }

  recordDamageTaken(sessionId: string, amount: number): void {
    const dmg = Math.max(0, amount);
    if (dmg <= 0) return;
    this.ensure(sessionId).damageTaken += dmg;
  }

  recordShotFired(sessionId: string): void {
    this.ensure(sessionId).shotsFired += 1;
  }

  recordShotHit(sessionId: string): void {
    this.ensure(sessionId).shotsHit += 1;
  }

  snapshot(sessionId: string): MatchPerformanceStats {
    const row = this.bySession.get(sessionId);
    return sanitizeMatchPerformance(row ?? createEmptyPerf());
  }

  entries(): IterableIterator<[string, MutablePerf]> {
    return this.bySession.entries();
  }
}

interface MutablePerf {
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  headshotDamage: number;
  shotsFired: number;
  shotsHit: number;
}

function createEmptyPerf(): MutablePerf {
  return {
    kills: 0,
    deaths: 0,
    damageDealt: 0,
    damageTaken: 0,
    headshotDamage: 0,
    shotsFired: 0,
    shotsHit: 0,
  };
}
