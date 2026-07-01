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

export class TeamHud {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
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
    this.list.replaceChildren();

    for (const teammate of teammates) {
      const entry = document.createElement('div');
      entry.className = 'team-hud-entry';
      if (!teammate.alive) {
        entry.classList.add('dead');
      }

      const color = TEAM_COLORS[teammate.teamId % TEAM_COLORS.length] ?? TEAM_COLORS[0];

      const name = document.createElement('div');
      name.className = 'team-hud-name';
      name.textContent = teammate.username;

      const shield = this.createShieldBar(teammate);
      const health = this.createHealthBar(teammate, color);

      entry.append(name, shield, health);
      this.list.appendChild(entry);
    }

    this.syncVisibility(teammates.length);
  }

  private createShieldBar(teammate: TeammateHudEntry): HTMLElement {
    const shieldRoot = document.createElement('div');
    shieldRoot.className = 'team-hud-shield';
    if (teammate.shieldPoints <= 0) {
      shieldRoot.classList.add('depleted');
    }
    if (teammate.shieldRecharging) {
      shieldRoot.classList.add('recharging');
    }

    const levels = document.createElement('div');
    levels.className = 'team-hud-shield-levels';
    levels.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < SHIELD_MAX_LEVEL; i++) {
      const levelEl = document.createElement('div');
      levelEl.className = 'team-hud-shield-level';
      const tier = i + 1;
      if (tier <= teammate.shieldLevel) {
        levelEl.classList.add('active');
      }
      if (tier <= teammate.shieldLevel && teammate.shieldPoints <= 0) {
        levelEl.classList.add('broken');
      }
      levels.appendChild(levelEl);
    }

    const track = document.createElement('div');
    track.className = 'team-hud-shield-track';

    const fill = document.createElement('div');
    fill.className = 'team-hud-shield-fill';
    const capacity = teammate.shieldCapacity;
    const shieldPct =
      capacity > 0 ? Math.min(100, (teammate.shieldPoints / capacity) * 100) : 0;
    const tierWidthPct = (teammate.shieldLevel / SHIELD_MAX_LEVEL) * 100;
    fill.style.width = teammate.alive
      ? `${(shieldPct / 100) * tierWidthPct}%`
      : '0%';

    const recharge = document.createElement('div');
    recharge.className = 'team-hud-shield-recharge';
    recharge.style.width = teammate.shieldRecharging
      ? `${teammate.shieldRechargeProgress * 100}%`
      : '0%';

    track.append(fill, recharge);
    shieldRoot.append(levels, track);
    return shieldRoot;
  }

  private createHealthBar(teammate: TeammateHudEntry, color: string): HTMLElement {
    const track = document.createElement('div');
    track.className = 'team-hud-track';

    const fill = document.createElement('div');
    fill.className = 'team-hud-fill';
    const ratio = teammate.alive
      ? Math.max(0, Math.min(1, teammate.hp / teammate.maxHp))
      : 0;
    fill.style.width = `${ratio * 100}%`;
    fill.style.background = `linear-gradient(90deg, ${color}, ${color}cc)`;

    track.appendChild(fill);
    return track;
  }

  private syncVisibility(teammateCount = this.list.childElementCount): void {
    this.root.hidden = !this.hudVisible || teammateCount === 0;
  }
}
