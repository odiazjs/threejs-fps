import '../styles/loading-overlay.css';

export class LoadingOverlay {
  private static instance: LoadingOverlay | null = null;

  static shared(): LoadingOverlay {
    if (!LoadingOverlay.instance) {
      LoadingOverlay.instance = new LoadingOverlay();
    }
    return LoadingOverlay.instance;
  }

  private depth = 0;
  private readonly root: HTMLDivElement;
  private readonly label: HTMLParagraphElement;

  private constructor() {
    this.root = document.createElement('div');
    this.root.id = 'global-loading-overlay';
    this.root.className = 'global-loading-overlay';
    this.root.hidden = true;
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-busy', 'true');

    const panel = document.createElement('div');
    panel.className = 'global-loading-panel';

    const spinner = document.createElement('div');
    spinner.className = 'global-loading-spinner';
    spinner.setAttribute('aria-hidden', 'true');

    this.label = document.createElement('p');
    this.label.className = 'global-loading-label';

    panel.append(spinner, this.label);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);
  }

  get active(): boolean {
    return this.depth > 0;
  }

  show(message = ''): void {
    this.depth += 1;
    this.label.textContent = message;
    this.root.hidden = false;
  }

  hide(): void {
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) {
      this.root.hidden = true;
      this.label.textContent = '';
    }
  }

  async run<T>(fn: () => Promise<T>, message = ''): Promise<T> {
    this.show(message);
    try {
      return await fn();
    } finally {
      this.hide();
    }
  }

  reset(): void {
    this.depth = 0;
    this.root.hidden = true;
    this.label.textContent = '';
  }
}
