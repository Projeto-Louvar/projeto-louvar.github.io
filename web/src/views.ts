import { h } from './dom';
import { BONUS_TITLE, type CatalogIndex } from './catalogIndex';
import type { Platform } from './downloads';
import { countLabel } from './format';
import type { InstallState } from './install';
import { installPanel } from './installView';
import type { Player } from './player';
import { hrefFor } from './router';
import { searchTracks } from './search';
import { coverImage, downloadAll, lockBadge, searchForm, tileGrid, trackList } from './components';
import { FULL_EDITION, PIX, PRICES, WHATSAPP_URL } from './edition';
import { creditList } from './covers';

export interface Ctx {
  idx: CatalogIndex;
  player: Player;
  platform: Platform;
  install: InstallState;
  onCleanup(fn: () => void): void;
}

const page = (...children: (Node | null)[]) => h('main', { class: 'page', id: 'conteudo' }, ...children);
const backLink = (href: string) => h('a', { class: 'btn back', href }, '← Voltar');

export function renderHome(ctx: Ctx): HTMLElement {
  return page(
    h('h1', { class: 'site-title', tabindex: '-1' }, 'Projeto Louvar'),
    searchForm(''),
    ...ctx.idx.homeSections().map((s) =>
      h('section', { class: 'section' },
        h('h2', {}, s.title),
        s.title === BONUS_TITLE && !FULL_EDITION ? h('p', { class: 'note section-note' }, 'Liberado depois do pagamento. Toque para ver como.') : null,
        tileGrid(ctx.idx, s.collections))),
    h('p', { class: 'site-foot' }, h('a', { class: 'btn', href: hrefFor({ name: 'install' }) }, 'Instalar no celular')),
    // Exigência das licenças das fotos (CC BY / BY-SA): indicar onde estão os autores
    h('p', { class: 'photo-note' }, 'Fotos das capas: Wikimedia Commons, licenças Creative Commons. Autores em projeto-louvar.github.io/#/creditos'),
  );
}

export function renderInstall(ctx: Ctx): HTMLElement {
  return page(
    backLink(hrefFor({ name: 'home' })),
    h('h1', { tabindex: '-1' }, 'Instalar no celular'),
    h('p', { class: 'note' }, 'O Louvar fica com um ícone na tela do celular, igual a um aplicativo. Não ocupa espaço e não pede cadastro.'),
    installPanel(ctx),
  );
}

export function renderCredits(ctx: Ctx): HTMLElement {
  return page(
    backLink(hrefFor({ name: 'home' })),
    h('h1', { tabindex: '-1' }, 'Créditos das fotos'),
    h('p', { class: 'note' }, 'As fotos das capas vêm do Wikimedia Commons e são de uso livre. Obrigado aos autores:'),
    h('ul', { class: 'credits' }, ...creditList(ctx.idx).map((c) =>
      h('li', {},
        h('p', {}, h('b', {}, c.collection), h('br'), `Foto de ${c.artist} · licença ${c.license}`),
        h('a', { class: 'btn btn-small', href: c.page, target: '_blank', rel: 'noopener', 'aria-label': `Ver a foto de ${c.collection}` }, 'Ver a foto')))),
  );
}

export function renderCollection(ctx: Ctx, id: string): HTMLElement {
  const c = ctx.idx.collection(id);
  if (!c) {
    return page(
      backLink(hrefFor({ name: 'home' })),
      h('h1', { tabindex: '-1' }, 'Coleção não encontrada'),
      h('p', { class: 'note' }, 'Ela pode ter sido renomeada ou removida. Volte ao início para escolher outra.'),
    );
  }
  const back = ctx.idx.backTarget(id);
  if (ctx.idx.isLocked(id)) return renderLocked(ctx, id, back);
  const tracks = ctx.idx.tracksOf(id);
  const kids = ctx.idx.childrenOf(id);
  return page(
    backLink(back ? hrefFor({ name: 'collection', id: back }) : hrefFor({ name: 'home' })),
    h('header', { class: 'col-header' },
      coverImage(ctx.idx, id, 'col-img'),
      h('div', { class: 'col-title' },
        h('h1', { tabindex: '-1' }, c.name),
        h('p', {}, countLabel(ctx.idx.totalTracks(id))))),
    tracks.length
      ? h('div', { class: 'actions' },
          h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => ctx.player.playQueue(tracks, 0) }, '▶ Tocar tudo'),
          downloadAll(ctx, c, tracks))
      : null,
    kids.length
      ? h('section', { class: 'section' }, tracks.length ? h('h2', {}, 'Coleções') : null, tileGrid(ctx.idx, kids))
      : null,
    tracks.length ? trackList(ctx, tracks) : null,
  );
}

function renderLocked(ctx: Ctx, id: string, back: string | null): HTMLElement {
  const c = ctx.idx.collection(id)!;
  return page(
    backLink(back ? hrefFor({ name: 'collection', id: back }) : hrefFor({ name: 'home' })),
    h('header', { class: 'col-header' },
      h('span', { class: 'col-media' }, coverImage(ctx.idx, id, 'col-img'), lockBadge()),
      h('div', { class: 'col-title' },
        h('h1', { tabindex: '-1' }, c.name),
        h('p', {}, countLabel(ctx.idx.totalTracks(id))))),
    unlockPanel(),
  );
}

/** Como liberar o bônus: escolher o valor, fazer o Pix, mandar o comprovante no WhatsApp, receber o link completo. */
function unlockPanel(): HTMLElement {
  const step = (n: number, ...body: (Node | string | null)[]) =>
    h('li', { class: 'unlock-step' }, h('span', { class: 'step-num', 'aria-hidden': 'true' }, String(n)), h('div', { class: 'unlock-body' }, ...body));
  const prices = PRICES.length
    ? h('ul', { class: 'prices' }, ...PRICES.map((p) =>
        h('li', { class: 'price' },
          p.icon ? h('span', { class: 'price-icon', 'aria-hidden': 'true' }, p.icon) : null,
          h('span', { class: 'price-value' }, p.value),
          p.label ? h('span', { class: 'price-label' }, p.label) : null)))
    : null;
  const pix = PIX ? pixBox(PIX) : null;
  return h('section', { class: 'locked-panel' },
    h('h2', {}, 'Conteúdo bônus'),
    h('p', {}, 'A Biblioteca Organizada por Momento e os Lançamentos são liberados depois do pagamento.'),
    h('ol', { class: 'unlock-steps' },
      step(1, h('p', {}, prices ? 'Escolha um valor:' : 'Faça o pagamento.'), prices),
      pix ? step(2, h('p', {}, 'Faça o Pix para esta chave:'), pix) : null,
      step(pix ? 3 : 2, h('p', {}, 'Envie o comprovante pelo WhatsApp.'),
        WHATSAPP_URL
          ? h('a', { class: 'btn btn-primary btn-big', href: WHATSAPP_URL, target: '_blank', rel: 'noopener' }, 'Enviar comprovante pelo WhatsApp')
          : h('p', { class: 'note' }, 'Fale com quem enviou o link do Projeto Louvar.')),
      step(pix ? 4 : 3, h('p', {}, 'Você recebe um link novo, com tudo liberado.'))));
}

function pixBox(pix: NonNullable<typeof PIX>): HTMLElement {
  const status = h('p', { class: 'pix-status', role: 'status' });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pix.copy);
      status.textContent = 'Chave copiada! Agora abra o aplicativo do banco e cole na área do Pix.';
    } catch {
      status.textContent = `Não deu para copiar sozinho. Digite a chave no banco: ${pix.copy}`;
    }
  };
  return h('div', { class: 'pix' },
    h('p', { class: 'pix-kind' }, pix.kind ? `Chave Pix · ${pix.kind}` : 'Chave Pix'),
    h('p', { class: 'pix-key' }, pix.display),
    pix.name ? h('p', { class: 'pix-name' }, pix.name) : null,
    h('button', { class: 'btn', type: 'button', onclick: () => void copy() }, 'Copiar chave Pix'),
    status);
}

export function renderSearch(ctx: Ctx, q: string): HTMLElement {
  const results = q ? searchTracks(ctx.idx.playableTracks, q) : [];
  const summary = !q
    ? null
    : results.length
      ? h('p', { class: 'note', role: 'status' }, `${countLabel(results.length)} encontrada${results.length === 1 ? '' : 's'} para “${q}”`)
      : h('p', { class: 'note', role: 'status' }, `Nenhuma música encontrada para “${q}”. Tente só uma palavra do nome.`);
  return page(
    backLink(hrefFor({ name: 'home' })),
    h('h1', { tabindex: '-1' }, 'Buscar'),
    searchForm(q),
    summary,
    results.length ? trackList(ctx, results) : null,
  );
}

export function renderError(retry: () => void): HTMLElement {
  return h('main', { class: 'page error-screen' },
    h('h1', {}, 'Sem conexão'),
    h('p', {}, 'Não foi possível carregar as músicas. Verifique a internet e tente de novo.'),
    h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: retry }, 'Tentar de novo'));
}
