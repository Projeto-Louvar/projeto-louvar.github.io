// Aviso da tela inicial e passo a passo de "Instalar no celular".
import { h } from './dom';
import type { Platform } from './downloads';
import { bannerDismissed, dismissBanner, installMode, isStandalone, type InstallMode, type InstallState } from './install';
import { hrefFor, parseHash } from './router';
import type { Ctx } from './views';

// Desenhos simples dos botões que a pessoa precisa achar na tela do celular
const icon = (paths: string) => {
  const span = h('span', { class: 'step-icon', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return span;
};
const ICON = {
  share: () => icon('<path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M7 10H5v11h14V10h-2"/>'),
  addHome: () => icon('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>'),
  more: () => icon('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  menu: () => icon('<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>'),
  compass: () => icon('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  phone: () => icon('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
};

const step = (n: number, text: (Node | string)[], pic: HTMLElement | null) =>
  h('li', { class: 'step' }, h('span', { class: 'step-num', 'aria-hidden': 'true' }, String(n)), h('p', {}, ...text), pic);

function iosSteps(): HTMLElement {
  return h('div', { class: 'install-how' },
    h('p', { class: 'install-tip' }, 'Se abriu pelo WhatsApp, toque primeiro no desenho da bússola ', ICON.compass(), ' para abrir no Safari.'),
    h('ol', { class: 'steps' },
      step(1, ['Toque no botão ', h('b', {}, 'Compartilhar'), ' (um quadrado com uma seta para cima). No iPhone mais novo, ele fica dentro dos três pontinhos ', h('b', {}, '•••'), ' embaixo.'], ICON.share()),
      step(2, ['Role a lista para baixo e toque em ', h('b', {}, 'Adicionar à Tela de Início'), '.'], ICON.addHome()),
      step(3, ['Toque em ', h('b', {}, 'Adicionar'), ', no canto de cima. Pronto: o ícone do Louvar aparece na tela do celular.'], ICON.phone())));
}

function androidSteps(): HTMLElement {
  return h('div', { class: 'install-how' },
    h('p', { class: 'install-tip' }, 'Se abriu pelo WhatsApp, toque primeiro nos três pontinhos ', ICON.menu(), ' e em ', h('b', {}, 'Abrir no Chrome'), '.'),
    h('ol', { class: 'steps' },
      step(1, ['Toque nos três pontinhos ', h('b', {}, '⋮'), ' no canto de cima, à direita.'], ICON.menu()),
      step(2, ['Toque em ', h('b', {}, 'Instalar app'), ' ou ', h('b', {}, 'Adicionar à tela inicial'), '.'], ICON.addHome()),
      step(3, ['Confirme tocando em ', h('b', {}, 'Instalar'), ' ou ', h('b', {}, 'Adicionar'), '. Pronto: o ícone do Louvar aparece na tela do celular.'], ICON.phone())));
}

const doneNote = () => h('p', { class: 'install-done', role: 'status' }, 'Pronto! O Louvar já está na tela do seu celular. Procure o ícone com o nome “Louvar”.');

async function askBrowser(install: InstallState, status: HTMLElement): Promise<void> {
  const result = await install.prompt();
  if (result === 'unavailable') location.hash = hrefFor({ name: 'install' });
  else if (result === 'dismissed') status.textContent = 'Tudo bem. Quando quiser, é só tocar em “Instalar no celular” de novo.';
}

/** Conteúdo da página #/instalar, conforme o aparelho. */
export function installPanel(ctx: Ctx): HTMLElement {
  const box = h('div', { class: 'install-panel' });
  const paint = () => {
    const mode: InstallMode = ctx.install.installed ? 'installed' : installMode(ctx.platform, isStandalone(), ctx.install.canPrompt);
    const status = h('p', { class: 'note', role: 'status' });
    const other = (label: string, steps: () => HTMLElement) =>
      h('details', { class: 'install-other' }, h('summary', { class: 'btn' }, label), steps());
    box.replaceChildren(
      ...(mode === 'installed' ? [doneNote()]
        : mode === 'prompt' ? [
            h('p', {}, 'Toque no botão abaixo e depois em ', h('b', {}, 'Instalar'), '.'),
            h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => void askBrowser(ctx.install, status) }, 'Instalar no celular'),
            status,
          ]
        : mode === 'ios' ? [iosSteps(), other('Tem um celular Android?', androidSteps)]
        : mode === 'android-manual' ? [androidSteps(), other('Tem um iPhone?', iosSteps)]
        : [
            h('p', {}, 'Abra este mesmo endereço no seu celular e siga o passo a passo:'),
            h('p', { class: 'install-url' }, location.host + location.pathname.replace(/index\.html$/, '')),
            other('No iPhone', iosSteps), other('No Android', androidSteps),
          ]),
    );
  };
  paint();
  ctx.onCleanup(ctx.install.onChange(paint));
  return box;
}

/**
 * Janela que sobe de baixo no primeiro acesso, convidando a instalar.
 * Não aparece no computador, quando já está instalado, na própria página de instalar,
 * nem por 30 dias depois de "Agora não". O botão do rodapé continua disponível sempre.
 */
export function mountInstallSheet(install: InstallState, platform: Platform, delayMs = 1200): () => void {
  const shouldShow = () =>
    platform !== 'desktop' && !install.installed && !isStandalone() && !bannerDismissed() &&
    parseHash(location.hash).name !== 'install';
  if (!shouldShow()) return () => undefined;

  const backdrop = h('div', { class: 'sheet-backdrop' });
  const title = h('h2', { class: 'sheet-title', id: 'sheet-title', tabindex: '-1' }, 'Instale o Louvar no celular');
  const body = h('div', { class: 'sheet-body' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }), body);
  let lastFocus: Element | null = null;
  let open = false;

  const close = (remember = true) => {
    if (!open) return;
    open = false;
    if (remember) dismissBanner();
    document.removeEventListener('keydown', onKey);
    backdrop.classList.remove('is-open');
    sheet.classList.remove('is-open');
    const done = () => { backdrop.remove(); sheet.remove(); };
    sheet.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400); // garante a remoção mesmo sem animação
    if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  backdrop.addEventListener('click', () => close());

  const paint = () => {
    if (install.installed) {
      body.replaceChildren(title, doneNote(),
        h('div', { class: 'sheet-actions sheet-actions-one' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close() }, 'Fechar')));
      return;
    }
    const status = h('p', { class: 'note', role: 'status' });
    body.replaceChildren(
      h('div', { class: 'sheet-head' },
        h('img', { class: 'sheet-icon', src: 'icons/icon-192.png', alt: '', width: '64', height: '64' }),
        h('div', {}, title, h('p', { class: 'sheet-sub' }, 'Abre com um toque, igual a um aplicativo.'))),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Agora não'),
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: () => {
            if (install.canPrompt) void askBrowser(install, status);
            else { close(); location.hash = hrefFor({ name: 'install' }); }
          },
        }, 'Instalar')),
      status,
    );
  };

  const timer = setTimeout(() => {
    if (!shouldShow()) return;
    paint();
    lastFocus = document.activeElement;
    document.body.append(backdrop, sheet);
    document.addEventListener('keydown', onKey);
    open = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      sheet.classList.add('is-open');
      title.focus({ preventScroll: true });
    }));
  }, delayMs);
  const off = install.onChange(() => { if (open) paint(); });
  return () => { clearTimeout(timer); off(); close(false); };
}
