import type { Collection, Track } from '../../shared/catalog';
import type { CatalogIndex } from './catalogIndex';
import { h } from './dom';
import { coverFor } from './covers';
import { collectionDownloadMode, downloadSequential } from './downloads';
import { countLabel } from './format';
import { hrefFor } from './router';
import type { Ctx } from './views';

export function searchForm(q: string): HTMLFormElement {
  const input = h('input', {
    type: 'search', name: 'q', value: q, placeholder: 'Música ou cantor',
    'aria-label': 'Buscar música', enterkeyhint: 'search', autocomplete: 'off',
  });
  return h('form', {
    class: 'search', role: 'search',
    onsubmit: (e: Event) => {
      e.preventDefault();
      const value = input.value.trim();
      if (value) location.hash = hrefFor({ name: 'search', q: value });
    },
  }, input, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Buscar'));
}

/** Foto da capa (decorativa: o nome da coleção já está escrito ao lado ou embaixo). */
export function coverImage(idx: CatalogIndex, id: string, cls: string): HTMLElement {
  const cover = coverFor(idx, id);
  return cover
    ? h('img', { class: cls, src: cover.file, alt: '', loading: 'lazy', decoding: 'async', width: '600', height: '600' })
    : h('span', { class: `${cls} is-empty`, 'aria-hidden': 'true' });
}

export function lockBadge(): HTMLElement {
  const b = h('span', { class: 'lock-badge', 'aria-hidden': 'true' }); // o texto "bloqueado" já informa
  b.innerHTML = LOCK_SVG + '<span>Bônus</span>';
  return b;
}
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>';

export function tileGrid(idx: CatalogIndex, cols: Collection[]): HTMLElement {
  return h('div', { class: 'tiles' }, ...cols.map((c) => {
    const locked = idx.isLocked(c.id);
    return h('a', { class: locked ? 'tile is-locked' : 'tile', href: hrefFor({ name: 'collection', id: c.id }) },
      h('span', { class: 'tile-media' }, coverImage(idx, c.id, 'tile-img'), locked ? lockBadge() : null),
      h('span', { class: 'tile-body' },
        h('span', { class: 'tile-name' }, c.name),
        h('span', { class: 'tile-count' }, locked ? `${countLabel(idx.totalTracks(c.id))} · bloqueado` : countLabel(idx.totalTracks(c.id)))));
  }));
}

export function trackList(ctx: Ctx, tracks: Track[]): HTMLElement {
  const list = h('ol', { class: 'tracks' }, ...tracks.map((t, i) =>
    h('li', { class: 'track', 'data-id': t.id },
      h('button', {
        class: 'track-play', type: 'button', 'aria-label': `Tocar ${t.title}`,
        onclick: () => ctx.player.playQueue(tracks, i),
      },
        h('span', { class: 'track-num', 'aria-hidden': 'true' }, i + 1),
        h('span', { class: 'track-text' },
          h('span', { class: 'track-title' }, t.title),
          t.artist ? h('span', { class: 'track-artist' }, t.artist) : null)),
      h('a', { class: 'btn btn-small', href: t.url, download: t.fileName, 'aria-label': `Baixar ${t.title}` }, 'Baixar'))));
  ctx.onCleanup(ctx.player.subscribe((s) => {
    for (const li of Array.from(list.children) as HTMLElement[]) {
      li.classList.toggle('is-current', li.dataset.id === s.current?.id);
    }
  }));
  return list;
}

export function downloadAll(ctx: Ctx, c: Collection, tracks: Track[]): HTMLElement {
  const mode = collectionDownloadMode(ctx.platform, c.zipUrls.length > 0);
  if (mode === 'none') {
    return h('p', { class: 'note' }, 'No iPhone, baixe uma música por vez no botão “Baixar”.');
  }
  if (mode === 'zip') {
    return h('div', { class: 'zip-links' }, ...c.zipUrls.map((url, i) =>
      h('a', { class: 'btn btn-big', href: url, download: '' },
        c.zipUrls.length === 1 ? '⬇ Baixar todas (.zip)' : `⬇ Baixar parte ${i + 1} de ${c.zipUrls.length} (.zip)`)));
  }
  const status = h('p', { class: 'note', role: 'status', 'aria-live': 'polite' });
  const button: HTMLButtonElement = h('button', {
    class: 'btn btn-big', type: 'button',
    onclick: async () => {
      button.disabled = true;
      try {
        await downloadSequential(tracks.map((t) => t.url), (done, total) => {
          status.textContent = done < total
            ? `Baixando ${done + 1} de ${total}… Se aparecer uma pergunta, toque em “Permitir”.`
            : `Pronto! ${countLabel(total)} enviadas para a pasta Downloads.`;
        });
      } catch {
        status.textContent = 'Não foi possível baixar todas. Tente de novo.';
      } finally {
        button.disabled = false;
      }
    },
  }, '⬇ Baixar todas');
  return h('div', { class: 'download-all' }, button, status);
}
