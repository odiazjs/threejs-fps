export interface JoinRequest {
  username: string;
  teamId: number;
}

export class JoinLobby {
  private readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly button: HTMLButtonElement;
  private readonly errorEl: HTMLElement;
  private readonly teamInputs: NodeListOf<HTMLInputElement>;
  private onJoin: ((request: JoinRequest) => Promise<void>) | null = null;

  constructor() {
    this.root = document.getElementById('join-lobby')!;
    this.input = document.getElementById('username-input') as HTMLInputElement;
    this.button = document.getElementById('join-game-btn') as HTMLButtonElement;
    this.errorEl = document.getElementById('join-error')!;
    this.teamInputs = this.root.querySelectorAll('input[name="team"]');

    this.button.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
    });
  }

  whenJoin(handler: (request: JoinRequest) => Promise<void>): void {
    this.onJoin = handler;
  }

  setLoading(loading: boolean): void {
    this.button.disabled = loading;
    this.input.disabled = loading;
    this.teamInputs.forEach((input) => {
      input.disabled = loading;
    });
    this.button.textContent = loading ? 'JOINING...' : 'JOIN GAME';
  }

  showError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.hidden = !message;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.style.display = 'none';
    this.setLoading(false);
  }

  private getSelectedTeamId(): number {
    const selected = this.root.querySelector<HTMLInputElement>(
      'input[name="team"]:checked',
    );
    return selected?.value === '1' ? 1 : 0;
  }

  private async submit(): Promise<void> {
    const username = this.input.value.trim();
    if (!username) {
      this.showError('Enter a username');
      return;
    }

    this.showError('');
    await this.onJoin?.({
      username,
      teamId: this.getSelectedTeamId(),
    });
  }
}
