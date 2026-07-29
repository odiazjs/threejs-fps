const MESSAGE_LIFETIME_SEC = 4;

interface HudMessage {
  id: number;
  text: string;
  victimName?: string;
  remaining: number;
}

export class MessageHud {
  private readonly root: HTMLElement;
  private message: HudMessage | null = null;
  private nextId = 0;

  constructor() {
    this.root = document.getElementById('message-hud')!;
  }

  push(text: string): void {
    // One toast at a time — replace any active notification.
    this.message = {
      id: this.nextId++,
      text,
      remaining: MESSAGE_LIFETIME_SEC,
    };
    this.render();
  }

  pushKill(victimName: string): void {
    this.message = {
      id: this.nextId++,
      text: 'You killed ',
      victimName,
      remaining: MESSAGE_LIFETIME_SEC,
    };
    this.render();
  }

  update(delta: number): void {
    if (!this.message) return;
    this.message.remaining -= delta;
    if (this.message.remaining <= 0) {
      this.message = null;
      this.render();
    }
  }

  private render(): void {
    this.root.replaceChildren();
    if (!this.message) return;

    const el = document.createElement('div');
    el.className = 'message-toast';

    if (this.message.victimName) {
      el.append(this.message.text);
      const name = document.createElement('span');
      name.className = 'message-toast-victim';
      name.textContent = this.message.victimName;
      el.append(name);
    } else {
      el.textContent = this.message.text;
    }

    this.root.appendChild(el);
  }
}
