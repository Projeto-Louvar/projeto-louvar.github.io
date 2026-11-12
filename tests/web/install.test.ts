// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallState, bannerDismissed, dismissBanner, installMode, isStandalone } from '../../web/src/install';

describe('installMode', () => {
  it('já instalado vence tudo', () => {
    expect(installMode('android', true, true)).toBe('installed');
    expect(installMode('ios', true, false)).toBe('installed');
  });
  it('usa a janela do navegador quando existe', () => {
    expect(installMode('android', false, true)).toBe('prompt');
    expect(installMode('desktop', false, true)).toBe('prompt');
  });
  it('sem janela: passo a passo por aparelho', () => {
    expect(installMode('ios', false, false)).toBe('ios');
    expect(installMode('android', false, false)).toBe('android-manual');
    expect(installMode('desktop', false, false)).toBe('desktop-manual');
  });
});

describe('isStandalone', () => {
  const fakeWin = (standalone: boolean | undefined, display: boolean) =>
    ({ navigator: { standalone }, matchMedia: () => ({ matches: display }) }) as unknown as Window;
  it('reconhece o modo aplicativo no iPhone e no Android', () => {
    expect(isStandalone(fakeWin(true, false))).toBe(true);
    expect(isStandalone(fakeWin(undefined, true))).toBe(true);
    expect(isStandalone(fakeWin(false, false))).toBe(false);
  });
});

describe('InstallState', () => {
  const fire = (outcome: 'accepted' | 'dismissed') => {
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome }),
    });
    window.dispatchEvent(e);
    return e;
  };

  it('guarda o convite do navegador e o usa uma vez só', async () => {
    const s = new InstallState(window);
    const changed = vi.fn();
    s.onChange(changed);
    expect(s.canPrompt).toBe(false);
    expect(await s.prompt()).toBe('unavailable');

    const e = fire('accepted');
    expect(e.defaultPrevented).toBe(true);
    expect(s.canPrompt).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);

    expect(await s.prompt()).toBe('accepted');
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(s.canPrompt).toBe(false);
    expect(s.installed).toBe(true);
  });

  it('recusa não marca como instalado', async () => {
    const s = new InstallState(window);
    fire('dismissed');
    expect(await s.prompt()).toBe('dismissed');
    expect(s.installed).toBe(false);
  });

  it('appinstalled marca como instalado', () => {
    const s = new InstallState(window);
    window.dispatchEvent(new Event('appinstalled'));
    expect(s.installed).toBe(true);
  });
});

describe('aviso "Agora não"', () => {
  beforeEach(() => localStorage.clear());
  it('some por 30 dias e depois volta', () => {
    const t0 = 1_000_000_000_000;
    expect(bannerDismissed(t0)).toBe(false);
    dismissBanner(t0);
    expect(bannerDismissed(t0 + 29 * 86_400_000)).toBe(true);
    expect(bannerDismissed(t0 + 31 * 86_400_000)).toBe(false);
  });
});
