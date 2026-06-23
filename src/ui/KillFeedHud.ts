const KILL_FEED_LIFETIME_SEC = 6;
const MAX_ENTRIES = 6;

interface KillEntry {
  id: number;
  killerName: string;
  victimName: string;
  remaining: number;
}

export class KillFeedHud {
  private readonly root: HTMLElement;
  private entries: KillEntry[] = [];
  private nextId = 0;

  constructor() {
    this.root = document.getElementById('kill-feed')!;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  addKill(killerName: string, victimName: string): void {
    this.entries.unshift({
      id: this.nextId++,
      killerName,
      victimName,
      remaining: KILL_FEED_LIFETIME_SEC,
    });
    this.entries = this.entries.slice(0, MAX_ENTRIES);
    this.render();
  }

  update(delta: number): void {
    const before = this.entries.length;
    this.entries = this.entries.filter((entry) => {
      entry.remaining -= delta;
      return entry.remaining > 0;
    });

    if (this.entries.length !== before) {
      this.render();
    }
  }

  private render(): void {
    this.root.replaceChildren();

    for (const entry of this.entries) {
      const row = document.createElement('div');
      row.className = 'kill-feed-entry';

      const killer = document.createElement('span');
      killer.className = 'kill-feed-killer';
      killer.textContent = entry.killerName;

      const icon = document.createElement('span');
      icon.className = 'kill-feed-icon';
      icon.textContent = ' killed ';

      const victim = document.createElement('span');
      victim.className = 'kill-feed-victim';
      victim.textContent = entry.victimName;

      row.append(killer, icon, victim);
      this.root.appendChild(row);
    }
  }
}
