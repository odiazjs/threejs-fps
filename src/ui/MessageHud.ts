const MESSAGE_LIFETIME_SEC = 5;

interface HudMessage {
  id: number;
  text: string;
  victimName?: string;
  remaining: number;
}

export class MessageHud {
  private readonly root: HTMLElement;
  private messages: HudMessage[] = [];
  private nextId = 0;

  constructor() {
    this.root = document.getElementById('message-hud')!;
  }

  push(text: string): void {
    this.messages.push({
      id: this.nextId++,
      text,
      remaining: MESSAGE_LIFETIME_SEC,
    });
    this.render();
  }

  pushKill(victimName: string): void {
    this.messages.push({
      id: this.nextId++,
      text: 'You killed ',
      victimName,
      remaining: MESSAGE_LIFETIME_SEC,
    });
    this.render();
  }

  update(delta: number): void {
    const before = this.messages.length;
    this.messages = this.messages.filter((message) => {
      message.remaining -= delta;
      return message.remaining > 0;
    });

    if (this.messages.length !== before) {
      this.render();
    }
  }

  private render(): void {
    this.root.replaceChildren();

    for (const message of this.messages) {
      const el = document.createElement('div');
      el.className = 'message-toast';

      if (message.victimName) {
        el.append(message.text);
        const name = document.createElement('span');
        name.className = 'message-toast-victim';
        name.textContent = message.victimName;
        el.append(name);
      } else {
        el.textContent = message.text;
      }

      this.root.appendChild(el);
    }
  }
}
