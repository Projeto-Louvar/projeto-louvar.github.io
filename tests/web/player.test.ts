// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../shared/catalog';
import { PLAYER_KEY, Player, type AudioLike } from '../../web/src/player';

class FakeAudio extends EventTarget implements AudioLike {
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  async play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

const tr = (id: string): Track => ({
  id, title: `Título ${id}`, artist: 'Artista', fileName: `${id}.mp3`, collectionId: 'c', md5: id, size: 1, url: `https://x/${id}.mp3`,
});
const queue = [tr('a'), tr('b'), tr('c')];

let audio: FakeAudio;
let player: Player;
beforeEach(() => {
  localStorage.clear();
  audio = new FakeAudio();
  player = new Player(audio, { skipDelayMs: 3000 });
});
afterEach(() => vi.useRealTimers());

describe('Player', () => {
  it('toca a fila a partir do índice pedido', async () => {
    player.playQueue(queue, 1);
    await Promise.resolve();
    expect(audio.src).toBe('https://x/b.mp3');
    expect(player.getState()).toMatchObject({ index: 1, playing: true, current: { id: 'b' } });
  });

  it('avisa assinantes imediatamente e a cada mudança', () => {
    const seen: (string | undefined)[] = [];
    player.subscribe((s) => seen.push(s.current?.id));
    player.playQueue(queue, 0);
    expect(seen[0]).toBeUndefined();
    expect(seen).toContain('a');
  });

  it('ao terminar toca a próxima e para na última', async () => {
    player.playQueue(queue, 1);
    audio.fire('ended');
    expect(player.getState().current!.id).toBe('c');
    audio.fire('ended');
    await Promise.resolve();
    expect(player.getState().current!.id).toBe('c');
    expect(audio.paused).toBe(true);
  });

  it('anterior: volta ao início se passou de 3 s, senão vai à faixa anterior', () => {
    player.playQueue(queue, 1);
    audio.currentTime = 10;
    player.prev();
    expect(audio.currentTime).toBe(0);
    expect(player.getState().index).toBe(1);
    player.prev();
    expect(player.getState().index).toBe(0);
  });

  it('toggle pausa e retoma', async () => {
    player.playQueue(queue, 0);
    await Promise.resolve();
    player.toggle();
    expect(player.getState().playing).toBe(false);
    player.toggle();
    await Promise.resolve();
    expect(player.getState().playing).toBe(true);
  });

  it('erro mostra aviso e pula após o atraso', () => {
    vi.useFakeTimers();
    player.playQueue(queue, 0);
    audio.fire('error');
    expect(player.getState().error).toBe('Não foi possível tocar esta música');
    vi.advanceTimersByTime(3000);
    expect(player.getState().current!.id).toBe('b');
    expect(player.getState().error).toBeNull();
  });

  it('erro não pula se o usuário já trocou de faixa', () => {
    vi.useFakeTimers();
    player.playQueue(queue, 0);
    audio.fire('error');
    player.playQueue(queue, 2);
    vi.advanceTimersByTime(3000);
    expect(player.getState().current!.id).toBe('c');
  });

  it('lembra a fila e restaura pausado', () => {
    player.playQueue(queue, 2);
    const saved = JSON.parse(localStorage.getItem(PLAYER_KEY)!);
    expect(saved).toEqual({ ids: ['a', 'b', 'c'], currentId: 'c', time: 0 });

    localStorage.setItem(PLAYER_KEY, JSON.stringify({ ids: ['a', 'x', 'c'], currentId: 'c', time: 42 }));
    const audio2 = new FakeAudio();
    const p2 = new Player(audio2);
    p2.restore((id) => queue.find((t) => t.id === id));
    expect(p2.getState()).toMatchObject({ index: 1, playing: false, currentTime: 42, current: { id: 'c' } });
    expect(p2.getState().queue.map((t) => t.id)).toEqual(['a', 'c']);
    audio2.fire('loadedmetadata');
    expect(audio2.currentTime).toBe(42);
  });

  it('restore ignora estado salvo inválido', () => {
    localStorage.setItem(PLAYER_KEY, JSON.stringify({ ids: ['x'], currentId: 'x', time: 1 }));
    player.restore(() => undefined);
    expect(player.getState().current).toBeNull();
  });
});
