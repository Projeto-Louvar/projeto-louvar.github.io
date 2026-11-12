import { h } from './dom';
import type { CatalogIndex } from './catalogIndex';
import type { Platform } from './downloads';
import { countLabel } from './format';
import type { InstallState } from './install';
import { installBanner, installPanel } from './installView';
import type { Player } from './player';
import { hrefFor } from './router';
import { searchTracks } from './search';
import { coverImage, downloadAll, searchForm, tileGrid, trackList } from './components';
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
    installBanner(ctx),
    searchForm(''),
    ...ctx.idx.homeSections().map((s) =>
      h('section', { class: 'section' }, h('h2', {}, s.title), tileGrid(ctx.idx, s.collections))),
    h('p', { class: 'site-foot' },
      h('a', { class: 'btn', href: hrefFor({ name: 'install' }) }, 'Instalar no celular'),
      h('a', { class: 'btn', href: hrefFor({ name: 'credits' }) }, 'Créditos das fotos')),
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
  const tracks = ctx.idx.tracksOf(id);
  const kids = ctx.idx.childrenOf(id);
  const back = ctx.idx.backTarget(id);
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

export function renderSearch(ctx: Ctx, q: string): HTMLElement {
  const results = q ? searchTracks(ctx.idx.data.tracks, q) : [];
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
