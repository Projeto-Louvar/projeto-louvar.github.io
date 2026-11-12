// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../shared/catalog';
import { countLabel, formatTime } from '../../web/src/format';
import { hrefFor, parseHash } from '../../web/src/router';
import { normalize, searchTracks } from '../../web/src/search';
import { safeGet, safeSet } from '../../web/src/storage';

const track = (id: string, title: string, artist = '', md5 = id): Track => ({
  id, title, artist, md5, fileName: `${title}.mp3`, collectionId: 'c', size: 1, url: `u/${id}`,
});

describe('format', () => {
  it('countLabel', () => {
    expect(countLabel(1)).toBe('1 música');
    expect(countLabel(0)).toBe('0 músicas');
    expect(countLabel(12)).toBe('12 músicas');
  });
  it('formatTime', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3725)).toBe('62:05');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});

describe('router', () => {
  it('ida e volta', () => {
    for (const r of [{ name: 'home' }, { name: 'collection', id: '1a-B_c' }, { name: 'search', q: 'hino da vitória' }, { name: 'credits' }, { name: 'install' }] as const) {
      expect(parseHash(hrefFor(r))).toEqual(r);
    }
  });
  it('página de créditos', () => {
    expect(hrefFor({ name: 'credits' })).toBe('#/creditos');
    expect(parseHash('#/creditos')).toEqual({ name: 'credits' });
  });
  it('hash desconhecido ou vazio vai para o início', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/qualquer')).toEqual({ name: 'home' });
  });
  it('hash malformado não quebra a página', () => {
    expect(() => parseHash('#/c/%')).not.toThrow();
    expect(parseHash('#/c/%')).toEqual({ name: 'home' });
    expect(() => parseHash('#/busca?q=%E0%A4%A')).not.toThrow();
  });
});

describe('search', () => {
  const tracks = [
    track('1', 'Hino da Vitória', 'Cassiane'),
    track('2', 'Com Muito Louvor', 'Cassiane'),
    track('3', 'Hino da Vitória', 'Cassiane', '1'), // mesmo md5 do 1
    track('4', 'Consagração', 'Aline Barros'),
  ];
  it('normalize remove acentos, caixa e espaços extras', () => {
    expect(normalize('  Consagração  AO   Rei ')).toBe('consagracao ao rei');
  });
  it('exige todas as palavras, em título ou artista, sem acento', () => {
    expect(searchTracks(tracks, 'vitoria cassiane').map((t) => t.id)).toEqual(['1']);
    expect(searchTracks(tracks, 'aline').map((t) => t.id)).toEqual(['4']);
  });
  it('não repete o mesmo áudio', () => {
    expect(searchTracks(tracks, 'hino').map((t) => t.id)).toEqual(['1']);
  });
  it('busca vazia não retorna nada', () => {
    expect(searchTracks(tracks, '   ')).toEqual([]);
  });
});

describe('storage', () => {
  afterEach(() => vi.restoreAllMocks());
  it('grava e lê JSON', () => {
    safeSet('k', { a: 1 });
    expect(safeGet('k')).toEqual({ a: 1 });
  });
  it('não quebra quando o armazenamento falha', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(() => safeSet('k', 1)).not.toThrow();
    expect(safeGet('k')).toBeNull();
  });
});
