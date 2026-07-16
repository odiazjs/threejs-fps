import { TEAM_COLORS } from '../../shared/combat/teams';
import { SHIELD_MAX_LEVEL } from '../../shared/combat/shield';

export interface TeammateHudEntry {
  id: string;
  username: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  teamId: number;
  shieldLevel: number;
  shieldPoints: number;
  shieldCapacity: number;
  shieldRecharging: boolean;
  shieldRechargeProgress: number;
}

/** Live DOM references + last-written values for one teammate row. */
interface TeamHudRow {
  id: string;
  root: HTMLElement;
  name: HTMLElement;
  shieldRoot: HTMLElement;
  levels: HTMLElement[];
  shieldFill: HTMLElement;
  shieldRecharge: HTMLElement;
  healthFill: HTMLElement;
  lastUsername: string;
  lastAlive: boolean;
  lastTeamId: number;
  lastShieldLevel: number;
  lastShieldDepleted: boolean;
  lastShieldRecharging: boolean;
  lastShieldFillPct: number;
  lastRechargePct: number;
  lastHealthPct: number;
}

/**
 * Teammate health/shield rows. DOM is built once per roster change and
 * mutated in place afterwards — a full rebuild every frame hammers the GC
 * and forces layout, which shows up as hitches on slow CPUs.
 */
export class TeamHud {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly rows: TeamHudRow[] = [];
  private hudVisible = false;

  constructor() {
    this.root = document.getElementById('team-hud')!;
    this.list = this.root.querySelector('.team-hud-list')!;
  }

  setVisible(visible: boolean): void {
    this.hudVisible = visible;
    this.syncVisibility();
  }

  update(teammates: TeammateHudEntry[]): void {
    if (!this.rosterMatches(teammates)) {
      this.rebuildRows(teammates);
    }

    for (let i = 0; i < teammates.length; i++) {
      this.updateRow(this.rows[i]!, teammates[i]!);
    }

    this.syncVisibility(teammates.length);
  }

  private rosterMatches(teammates: TeammateHudEntry[]): boolean {
    if (teammates.length !== this.rows.length) return false;
    for (let i = 0; i < teammates.length; i++) {
      if (teammates[i]!.id !== this.rows[i]!.id) return false;
    }
    return true;
  }

  private rebuildRows(teammates: TeammateHudEntry[]): void {
    this.list.replaceChildren();
    this.rows.length = 0;

    for (const teammate of teammates) {
      const entry = document.createElement('div');
      entry.className = 'team-hud-entry';

      const name = document.createElement('div');
      name.className = 'team-hud-name';

      const shieldRoot = document.createElement('div');
      shieldRoot.className = 'team-hud-shield';

      const levels = document.createElement('div');
      levels.className = 'team-hud-shield-levels';
      levels.setAttribute('aria-hidden', 'true');
      const levelEls: HTMLElement[] = [];
      for (let i = 0; i < SHIELD_MAX_LEVEL; i++) {
        const levelEl = document.createElement('div');
        levelEl.className = 'team-hud-shield-level';
        levels.appendChild(levelEl);
        levelEls.push(levelEl);
      }

      const shieldTrack = document.createElement('div');
      shieldTrack.className = 'team-hud-shield-track';
      const shieldFill = document.createElement('div');
      shieldFill.className = 'team-hud-shield-fill';
      const shieldRecharge = document.createElement('div');
      shieldRecharge.className = 'team-hud-shield-recharge';
      shieldTrack.append(shieldFill, shieldRecharge);
      shieldRoot.append(levels, shieldTrack);

      const healthTrack = document.createElement('div');
      healthTrack.className = 'team-hud-track';
      const healthFill = document.createElement('div');
      healthFill.className = 'team-hud-fill';
      healthTrack.appendChild(healthFill);

      entry.append(name, shieldRoot, healthTrack);
      this.list.appendChild(entry);

      // Sentinel values force the first updateRow pass to write everything.
      this.rows.push({
        id: teammate.id,
        root: entry,
        name,
        shieldRoot,
        levels: levelEls,
        shieldFill,
        shieldRecharge,
        healthFill,
        lastUsername: '',
        lastAlive: true,
        lastTeamId: -1,
        lastShieldLevel: -1,
        lastShieldDepleted: false,
        lastShieldRecharging: false,
        lastShieldFillPct: -1,
        lastRechargePct: -1,
        lastHealthPct: -1,
      });
    }
  }

  private updateRow(row: TeamHudRow, teammate: TeammateHudEntry): void {
    if (teammate.username !== row.lastUsername) {
      row.lastUsername = teammate.username;
      row.name.textContent = teammate.username;
    }

    if (teammate.alive !== row.lastAlive) {
      row.lastAlive = teammate.alive;
      row.root.classList.toggle('dead', !teammate.alive);
    }

    const depleted = teammate.shieldPoints <= 0;
    if (depleted !== row.lastShieldDepleted || teammate.shieldLevel !== row.lastShieldLevel) {
      row.lastShieldDepleted = depleted;
      row.lastShieldLevel = teammate.shieldLevel;
      row.shieldRoot.classList.toggle('depleted', depleted);
      for (let i = 0; i < row.levels.length; i++) {
        const active = i + 1 <= teammate.shieldLevel;
        row.levels[i]!.classList.toggle('active', active);
        row.levels[i]!.classList.toggle('broken', active && depleted);
      }
    }

    if (teammate.shieldRecharging !== row.lastShieldRecharging) {
      row.lastShieldRecharging = teammate.shieldRecharging;
      row.shieldRoot.classList.toggle('recharging', teammate.shieldRecharging);
    }

    const capacity = teammate.shieldCapacity;
    const shieldPct = capacity > 0 ? Math.min(100, (teammate.shieldPoints / capacity) * 100) : 0;
    const tierWidthPct = (teammate.shieldLevel / SHIELD_MAX_LEVEL) * 100;
    const shieldFillPct = teammate.alive
      ? Math.round((shieldPct / 100) * tierWidthPct * 10) / 10
      : 0;
    if (shieldFillPct !== row.lastShieldFillPct) {
      row.lastShieldFillPct = shieldFillPct;
      row.shieldFill.style.width = `${shieldFillPct}%`;
    }

    const rechargePct = teammate.shieldRecharging
      ? Math.round(teammate.shieldRechargeProgress * 1000) / 10
      : 0;
    if (rechargePct !== row.lastRechargePct) {
      row.lastRechargePct = rechargePct;
      row.shieldRecharge.style.width = `${rechargePct}%`;
    }

    const ratio = teammate.alive
      ? Math.max(0, Math.min(1, teammate.hp / teammate.maxHp))
      : 0;
    const healthPct = Math.round(ratio * 1000) / 10;
    if (healthPct !== row.lastHealthPct) {
      row.lastHealthPct = healthPct;
      row.healthFill.style.width = `${healthPct}%`;
    }

    if (teammate.teamId !== row.lastTeamId) {
      row.lastTeamId = teammate.teamId;
      const color = TEAM_COLORS[teammate.teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0];
      row.healthFill.style.background = `linear-gradient(90deg, ${color}, ${color}cc)`;
    }
  }

  private syncVisibility(teammateCount = this.rows.length): void {
    this.root.hidden = !this.hudVisible || teammateCount === 0;
  }
}
