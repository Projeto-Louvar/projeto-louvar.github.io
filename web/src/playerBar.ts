import { h } from './dom';
import { formatTime } from './format';
import { ICONS } from './icons';
import type { Player } from './player';

function controlButton(icon: string, label: string, onclick: () => void, extraClass = ''): HTMLButtonElement {
  const iconEl = h('span', { class: 'pb-icon' });
  iconEl.innerHTML = icon;
  return h('button', { type: 'button', class: `pb-btn ${extraClass}`.trim(), onclick }, iconEl, h('span', { class: 'pb-label' }, label));
}

export function renderPlayerBar(player: Player): HTMLElement {
  const title = h('p', { class: 'pb-title' });
  const artist = h('p', { class: 'pb-artist' });
  const error = h('p', { class: 'pb-error', role: 'alert' });
  const range = h('input', { type: 'range', class: 'pb-range', min: '0', max: '0', step: '1', value: '0', 'aria-label': 'Posição da música' });
  const time = h('span', { class: 'pb-time' });
  const prev = controlButton(ICONS.prev, 'Anterior', () => player.prev());
  const play = controlButton(ICONS.play, 'Tocar', () => player.toggle(), 'pb-play');
  const next = controlButton(ICONS.next, 'Próxima', () => player.next());

  let dragging = false;
  range.addEventListener('input', () => { dragging = true; });
  range.addEventListener('change', () => {
    dragging = false;
    player.seek(Number(range.value));
  });

  const bar = h('div', { class: 'player', hidden: true, role: 'region', 'aria-label': 'Tocador' },
    h('div', { class: 'pb-info' }, title, artist, error),
    h('div', { class: 'pb-progress' }, range, time),
    h('div', { class: 'pb-controls' }, prev, play, next));

  let wasPlaying: boolean | null = null;
  player.subscribe((s) => {
    bar.hidden = !s.current;
    document.body.classList.toggle('has-player', !!s.current);
    if (!s.current) return;
    title.textContent = s.current.title;
    artist.textContent = s.current.artist;
    error.textContent = s.error ?? '';
    if (wasPlaying !== s.playing) {
      wasPlaying = s.playing;
      play.querySelector('.pb-icon')!.innerHTML = s.playing ? ICONS.pause : ICONS.play;
      play.querySelector('.pb-label')!.textContent = s.playing ? 'Pausar' : 'Tocar';
    }
    range.max = String(Math.floor(s.duration));
    if (!dragging) range.value = String(Math.floor(s.currentTime));
    time.textContent = `${formatTime(s.currentTime)} / ${formatTime(s.duration)}`;
  });
  return bar;
}
