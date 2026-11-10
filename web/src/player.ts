import type { Track } from '../../shared/catalog';
import { safeGet, safeSet } from './storage';

export interface PlayerState {
  queue: Track[];
  index: number;
  current: Track | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
}

export interface AudioLike extends EventTarget {
  src: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

interface Saved { ids: string[]; currentId: string; time: number }

export const PLAYER_KEY = 'louvores.player';
const ERROR_TEXT = 'Não foi possível tocar esta música';

export class Player {
  private state: PlayerState = { queue: [], index: -1, current: null, playing: false, currentTime: 0, duration: 0, error: null };
  private listeners = new Set<(s: PlayerState) => void>();
  private pendingSeek: number | null = null;
  private lastSave = 0;

  constructor(private audio: AudioLike, private opts: { skipDelayMs?: number } = {}) {
    audio.addEventListener('timeupdate', () => {
      this.patch({ currentTime: audio.currentTime });
      if (Date.now() - this.lastSave > 5000) this.save(audio.currentTime);
    });
    audio.addEventListener('durationchange', () => {
      this.patch({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    });
    audio.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek !== null) {
        audio.currentTime = this.pendingSeek;
        this.pendingSeek = null;
      }
    });
    audio.addEventListener('play', () => this.patch({ playing: true, error: null }));
    audio.addEventListener('pause', () => this.patch({ playing: false }));
    audio.addEventListener('ended', () => this.next());
    audio.addEventListener('error', () => {
      const at = this.state.index;
      this.patch({ playing: false, error: ERROR_TEXT });
      setTimeout(() => {
        if (this.state.index === at && this.state.error) this.next();
      }, this.opts.skipDelayMs ?? 3000);
    });
    this.setupMediaSession();
  }

  getState(): PlayerState {
    return this.state;
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  playQueue(tracks: Track[], start = 0): void {
    this.patch({ queue: tracks });
    this.load(start, true);
  }

  toggle(): void {
    if (!this.state.current) return;
    if (this.audio.paused) void this.safePlay();
    else this.audio.pause();
  }

  next(): void {
    if (this.state.index < this.state.queue.length - 1) this.load(this.state.index + 1, true);
    else this.audio.pause();
  }

  prev(): void {
    if (this.audio.currentTime > 3 || this.state.index <= 0) {
      this.seek(0);
      return;
    }
    this.load(this.state.index - 1, true);
  }

  seek(seconds: number): void {
    this.audio.currentTime = Math.max(0, seconds);
    this.patch({ currentTime: this.audio.currentTime });
  }

  restore(lookup: (id: string) => Track | undefined): void {
    const saved = safeGet<Saved>(PLAYER_KEY);
    if (!saved || !Array.isArray(saved.ids)) return;
    const queue = saved.ids.map(lookup).filter((t): t is Track => !!t);
    if (!queue.length) return;
    const found = queue.findIndex((t) => t.id === saved.currentId);
    this.patch({ queue });
    this.load(found >= 0 ? found : 0, false, found >= 0 ? Number(saved.time) || 0 : 0);
  }

  private load(i: number, autoplay: boolean, startAt = 0): void {
    const t = this.state.queue[i];
    if (!t) return;
    this.audio.src = t.url;
    this.pendingSeek = startAt > 0 ? startAt : null;
    this.patch({ index: i, current: t, currentTime: startAt, duration: 0, error: null });
    this.updateMetadata(t);
    this.save(startAt);
    if (autoplay) void this.safePlay();
  }

  private async safePlay(): Promise<void> {
    try {
      await this.audio.play();
    } catch {
      this.patch({ playing: false });
    }
  }

  private save(time: number): void {
    if (!this.state.current) return;
    safeSet(PLAYER_KEY, { ids: this.state.queue.map((t) => t.id), currentId: this.state.current.id, time: Math.floor(time) });
    this.lastSave = Date.now();
  }

  private patch(p: Partial<PlayerState>): void {
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn(this.state);
  }

  private setupMediaSession(): void {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* ação não suportada neste navegador */
      }
    };
    set('play', () => void this.safePlay());
    set('pause', () => this.audio.pause());
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    set('seekto', (d) => {
      if (d.seekTime != null) this.seek(d.seekTime);
    });
  }

  private updateMetadata(t: Track): void {
    if (typeof navigator === 'undefined' || !navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist || 'Louvores',
      album: 'Louvores',
      artwork: [{ src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
}
