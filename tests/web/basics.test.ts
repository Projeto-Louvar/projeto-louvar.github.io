// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../shared/catalog';
import { countLabel, formatTime } from '../../web/src/format';
import { hrefFor, parseHash } from '../../web/src/router';
import { normalize, searchTracks, soundAlike } from '../../web/src/search';
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
    for (const r of [{ name: 'home' }, { name: 'collection', id: '1a-B_c' }, { name: 'search', q: 'hino da vitória' }, { name: 'credits' }, { name: 'install' }, { name: 'bonus' }] as const) {
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

describe('soundAlike', () => {
  it('aproxima grafias de mesmo som', () => {
    expect(soundAlike('rocha')).toBe(soundAlike('roxa'));
    expect(soundAlike('jesus')).toBe(soundAlike('jezus'));
    expect(soundAlike('sacrificio')).toBe(soundAlike('sacrifisio'));
    expect(soundAlike('rossana')).toBe(soundAlike('rosana'));
    expect(soundAlike('hosana')).toBe(soundAlike('osana'));
  });
});

describe('busca tolerante a erros de digitação', () => {
  const tracks = [
    track('1', 'Santo Pra Sempre', 'Fernandinho'),
    track('2', 'Aleluia', 'Gabriela Rocha'),
    track('3', 'Hino da Vitória', 'Cassiane'),
    track('4', 'Alegria', 'Aline Barros'),
    track('5', 'Santo', 'Aline Barros'),
    track('6', 'Sacrifício', 'Ministério Zoe'),
  ];
  const ids = (q: string) => searchTracks(tracks, q).map((t) => t.id);

  it('letra faltando, sobrando ou trocada', () => {
    expect(ids('fernadinho')).toEqual(['1']);   // faltou o n
    expect(ids('aleluiia')[0]).toBe('2');       // sobrou um i (Aleluia vem antes de Alegria)
    expect(ids('vitoira cassiane')).toEqual(['3']); // letras invertidas
    expect(ids('sacrificio')).toEqual(['6']);   // sem acento
  });
  it('palavra curta não aceita erro (evita resultado sem sentido)', () => {
    expect(ids('hno')).toEqual([]);
  });
  it('última palavra vale pelo começo, para quem ainda está digitando', () => {
    expect(ids('aleg')).toEqual(['4']);
    expect(ids('hino da vit')).toEqual(['3']);
  });
  it('resultado exato vem antes do aproximado', () => {
    expect(ids('santo')[0]).toBe('5');
    expect(ids('santo')).toContain('1');
  });
  it('todas as palavras precisam bater', () => {
    expect(ids('santo cassiane')).toEqual([]);
  });
  it('erros de som: grafias que soam igual', () => {
    expect(ids('gabriela roxa')).toEqual(['2']);
    expect(ids('jezus')).toEqual([]); // não existe na lista de teste, mas não quebra
    expect(ids('sacrifisio')).toEqual(['6']);
    expect(ids('ministerio zoé')).toEqual(['6']);
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
