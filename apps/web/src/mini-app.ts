export interface TelegramApp {
  initData?: string;
  colorScheme?: 'light' | 'dark';
  viewportStableHeight?: number;
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  ready?(): void;
  expand?(): void;
  isVersionAtLeast?(version: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent?(event: string, listener: () => void): void;
  offEvent?(event: string, listener: () => void): void;
  BackButton?: { show(): void; hide(): void; onClick(fn: () => void): void; offClick(fn: () => void): void };
  SettingsButton?: { show(): void; hide(): void; onClick(fn: () => void): void; offClick(fn: () => void): void };
  HapticFeedback?: { selectionChanged(): void; notificationOccurred(type: 'success' | 'error' | 'warning'): void };
}
declare global { interface Window { Telegram?: { WebApp?: TelegramApp } } }
const safely = (fn: () => void) => { try { fn(); } catch { /* Optional client capabilities never block the site. */ } };

/** No identity is read from initDataUnsafe. The existing server validates initData. */
export class MiniAppBridge {
  readonly active: boolean;
  private subscriptions: [string, () => void][] = [];
  private back = () => this.navigate('/');
  private settings = () => this.navigate('/notifications');
  constructor(private app: TelegramApp | undefined, private root: HTMLElement, private navigate: (path: string) => void) {
    this.active = Boolean(app?.initData);
  }
  start() {
    if (!this.active || !this.app) return;
    const app = this.app;
    this.root.dataset.miniApp = 'true';
    this.sync();
    safely(() => app.ready?.());
    safely(() => app.expand?.());
    safely(() => app.BackButton?.onClick(this.back));
    safely(() => { app.SettingsButton?.onClick(this.settings); app.SettingsButton?.show(); });
    for (const event of ['themeChanged', 'viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged']) {
      const listener = () => this.sync();
      safely(() => app.onEvent?.(event, listener));
      this.subscriptions.push([event, listener]);
    }
  }
  sync() {
    if (!this.active || !this.app) return;
    const app = this.app;
    const theme = app.colorScheme === 'light' ? 'light' : 'dark';
    this.root.dataset.theme = theme;
    const color = theme === 'dark' ? '#101113' : '#f4f4f2';
    safely(() => app.setHeaderColor?.(color));
    safely(() => app.setBackgroundColor?.(color));
    safely(() => app.setBottomBarColor?.(color));
    for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
      const value = Math.max(0, app.safeAreaInset?.[edge] ?? 0) + Math.max(0, app.contentSafeAreaInset?.[edge] ?? 0);
      this.root.style.setProperty(`--tg-safe-${edge}`, `${Math.min(200, value)}px`);
    }
    if (Number.isFinite(app.viewportStableHeight) && app.viewportStableHeight! > 100) this.root.style.setProperty('--tg-height', `${app.viewportStableHeight}px`);
  }
  route(path: string) {
    if (!this.active) return;
    safely(() => path === '/' ? this.app?.BackButton?.hide() : this.app?.BackButton?.show());
  }
  feedback(kind: 'selection' | 'success' | 'error') {
    if (!this.active) return;
    safely(() => kind === 'selection' ? this.app?.HapticFeedback?.selectionChanged() : this.app?.HapticFeedback?.notificationOccurred(kind));
  }
  destroy() {
    safely(() => this.app?.BackButton?.offClick(this.back));
    safely(() => { this.app?.SettingsButton?.offClick(this.settings); this.app?.SettingsButton?.hide(); });
    for (const [event, listener] of this.subscriptions) safely(() => this.app?.offEvent?.(event, listener));
    this.subscriptions = [];
  }
}
