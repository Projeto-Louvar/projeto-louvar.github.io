// "Instalar no celular": põe o site na tela inicial como se fosse um aplicativo.
// Android/Chrome oferece a janela de instalação (beforeinstallprompt); o iPhone não tem isso,
// então mostramos o passo a passo do Safari.
import type { Platform } from './downloads';
import { safeGet, safeSet } from './storage';

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'android-manual' | 'desktop-manual';

export function installMode(platform: Platform, standalone: boolean, canPrompt: boolean): InstallMode {
  if (standalone) return 'installed';
  if (canPrompt) return 'prompt';
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android-manual';
  return 'desktop-manual';
}

export function isStandalone(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || !!win.matchMedia?.('(display-mode: standalone)').matches;
}

interface PromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type PromptResult = 'accepted' | 'dismissed' | 'unavailable';

export class InstallState {
  private deferred: PromptEvent | null = null;
  private listeners = new Set<() => void>();
  installed = false;

  constructor(win: Window = window) {
    win.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // guarda para mostrar quando a pessoa tocar no nosso botão
      this.deferred = e as PromptEvent;
      this.emit();
    });
    win.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.installed = true;
      this.emit();
    });
  }

  get canPrompt(): boolean {
    return this.deferred !== null;
  }

  async prompt(): Promise<PromptResult> {
    const e = this.deferred;
    if (!e) return 'unavailable';
    this.deferred = null; // o navegador só deixa usar uma vez
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') this.installed = true;
    this.emit();
    return outcome;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

// O aviso da tela inicial some por 30 dias quando a pessoa toca em "Agora não".
const DISMISS_KEY = 'louvar.instalar.adiado';
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export function bannerDismissed(now = Date.now()): boolean {
  const at = safeGet<number>(DISMISS_KEY);
  return typeof at === 'number' && now - at < DISMISS_MS;
}

export function dismissBanner(now = Date.now()): void {
  safeSet(DISMISS_KEY, now);
}
