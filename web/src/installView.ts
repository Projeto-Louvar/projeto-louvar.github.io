// Aviso da tela inicial e passo a passo de "Instalar no celular".
import { h } from './dom';
import { bannerDismissed, dismissBanner, installMode, isStandalone, type InstallMode } from './install';
import { hrefFor } from './router';
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

async function askBrowser(ctx: Ctx, status: HTMLElement): Promise<void> {
  const result = await ctx.install.prompt();
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
            h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => void askBrowser(ctx, status) }, 'Instalar no celular'),
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

/** Aviso da tela inicial. Some se já está instalado, no computador, ou se a pessoa tocou em "Agora não". */
export function installBanner(ctx: Ctx): HTMLElement {
  const box = h('aside', { class: 'install-banner', 'aria-label': 'Instalar no celular' });
  const paint = () => {
    // Acabou de instalar por aqui: confirma em vez de sumir sem explicação
    if (ctx.install.installed && !isStandalone()) { box.hidden = false; box.replaceChildren(doneNote()); return; }
    const mode = installMode(ctx.platform, isStandalone(), ctx.install.canPrompt);
    if (mode === 'installed' || ctx.platform === 'desktop' || bannerDismissed()) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;
    const status = h('p', { class: 'note', role: 'status' });
    box.replaceChildren(
      h('div', { class: 'install-text' },
        h('p', { class: 'install-title' }, 'Coloque o Louvar na tela do seu celular'),
        h('p', {}, 'Assim você abre com um toque, igual a um aplicativo.')),
      h('div', { class: 'install-actions' },
        mode === 'prompt'
          ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => void askBrowser(ctx, status) }, 'Instalar no celular')
          : h('a', { class: 'btn btn-primary', href: hrefFor({ name: 'install' }) }, 'Instalar no celular'),
        h('button', { class: 'btn', type: 'button', onclick: () => { dismissBanner(); paint(); } }, 'Agora não')),
      status,
    );
  };
  paint();
  ctx.onCleanup(ctx.install.onChange(paint));
  return box;
}
