import { describe, expect, it, vi } from 'vitest';
import type { Catalog, Collection, Track } from '../../shared/catalog';
import { CatalogIndex, displayName, loadCatalog } from '../../web/src/catalogIndex';

const col = (id: string, parentId: string | null, childIds: string[], trackIds: string[]): Collection => ({
  id, name: id.toUpperCase(), parentId, color: '#000', childIds, trackIds, zipUrls: [], zipKey: '',
});
const tr = (id: string, collectionId: string): Track => ({
  id, title: id, artist: '', fileName: `${id}.mp3`, collectionId, md5: id, size: 1, url: id,
});

// R ─ S (seção, sem faixas) ─ A (2 faixas) ─ A1 (1 faixa)
//   │                       └ B (1 faixa)
//   └ O (1 faixa, folha) 
const data: Catalog = {
  generatedAt: '', rootId: 'R',
  collections: [
    col('R', null, ['S', 'O'], []),
    col('S', 'R', ['A', 'B'], []),
    col('A', 'S', ['A1'], ['t1', 't2']),
    col('A1', 'A', [], ['t3']),
    col('B', 'S', [], ['t4']),
    col('O', 'R', [], ['t5']),
  ],
  tracks: [tr('t1', 'A'), tr('t2', 'A'), tr('t3', 'A1'), tr('t4', 'B'), tr('t5', 'O')],
};
const idx = new CatalogIndex(data);

describe('CatalogIndex', () => {
  it('acessa raiz, coleções e faixas', () => {
    expect(idx.root.id).toBe('R');
    expect(idx.collection('A')!.name).toBe('A');
    expect(idx.track('t3')!.collectionId).toBe('A1');
    expect(idx.tracksOf('A').map((t) => t.id)).toEqual(['t1', 't2']);
    expect(idx.childrenOf('S').map((c) => c.id)).toEqual(['A', 'B']);
    expect(idx.collection('nada')).toBeUndefined();
  });
  it('conta faixas recursivamente', () => {
    expect(idx.totalTracks('A')).toBe(3);
    expect(idx.totalTracks('R')).toBe(5);
  });
  it('monta seções do início', () => {
    expect(idx.homeSections().map((s) => [s.title, s.collections.map((c) => c.id)])).toEqual([
      ['S', ['A', 'B', 'O']],
    ]);
  });
  it('define para onde o botão Voltar leva', () => {
    expect(idx.backTarget('A')).toBeNull();   // pai é título de seção
    expect(idx.backTarget('O')).toBeNull();   // pai é a raiz
    expect(idx.backTarget('A1')).toBe('A');
  });
});

describe('loadCatalog', () => {
  it('lê o JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    await expect(loadCatalog(fetchFn, './catalog.json')).resolves.toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith('./catalog.json', { cache: 'no-cache' });
  });
  it('falha com status de erro', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('x', { status: 500 }));
    await expect(loadCatalog(fetchFn)).rejects.toThrow('HTTP 500');
  });
});

describe('seções: biblioteca e bônus', () => {
  const col = (id: string, name: string, parentId: string | null, childIds: string[], trackIds: string[]) =>
    ({ id, name, parentId, childIds, trackIds, color: '#000', zipUrls: [] }) as unknown as Collection;
  const t = (id: string, c: string) => ({ id, title: id, artist: '', md5: id, fileName: id, collectionId: c, size: 1, url: id }) as Track;
  const data = {
    rootId: 'R',
    collections: [
      col('R', 'Louvores - SVA', null, ['B', 'P'], []),
      col('B', 'Louvores - Biblioteca Completa', 'R', ['M', 'G'], []),
      col('M', 'Por Momento', 'B', ['N'], []),
      col('N', '9. Lançamentos 2027', 'M', [], ['t3']),
      col('G', 'Gospel', 'B', [], ['t1']),
      col('P', 'Louvores - Bônus', 'R', ['I', 'L'], []),
      col('I', 'Bônus 1 - Hinos Infantis', 'P', [], ['t2']),
      col('L', 'Bônus 2 - Lançamentos 2026', 'P', ['L1'], []),
      col('L1', 'Lançamentos - Março', 'L', [], ['t4']),
    ],
    tracks: [t('t1', 'G'), t('t2', 'I'), t('t3', 'N'), t('t4', 'L1')],
  } as unknown as Catalog;
  const ix = new CatalogIndex(data);

  it('hinos infantis vão para a biblioteca e lançamentos (onde estiverem) para o bônus', () => {
    expect(ix.homeSections().map((s) => [s.title, s.collections.map((c) => c.id)])).toEqual([
      ['Biblioteca Completa', ['M', 'G', 'I']],
    ]);
    expect(ix.bonusCollections().map((c) => c.id)).toEqual(['N', 'L']);
    expect(ix.bonusCount()).toBe(2);
    expect(ix.bonusTracks().map((t) => t.id).sort()).toEqual(['t3', 't4']);
  });
  it('limpa prefixos de organização dos nomes', () => {
    expect(ix.collection('I')!.name).toBe('Hinos Infantis');
    expect(displayName('Bônus 2 – Extras')).toBe('Extras');
    expect(displayName('Louvores - Biblioteca Completa')).toBe('Biblioteca Completa');
    expect(displayName('Louvor & Adoração')).toBe('Louvor & Adoração');
    expect(displayName('Bônus 2 - Lançamentos 2026')).toBe('Lançamentos 2027');
    expect(displayName('9. Lançamentos 2026')).toBe('9. Lançamentos 2027');
  });
});

describe('tocar aleatório', () => {
  it('embaralha sem perder nem repetir músicas', async () => {
    const { shuffled } = await import('../../web/src/shuffle');
    const items = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffled(items);
    expect(out).toHaveLength(50);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(items[0]).toBe(0); // não mexe na lista original
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    expect(shuffled(items, rand)).not.toEqual(items);
  });
  it('junta as músicas das subpastas, sem repetir o mesmo áudio', () => {
    expect(idx.allTracksUnder('A').map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(idx.allTracksUnder('R').map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });
});

describe('mesma música no site', () => {
  const t = (id: string, c: string, songId: string): Track => ({ id, title: id, artist: '', fileName: id, collectionId: c, md5: id, size: 1, url: `u/${songId}`, songId });
  const cat = {
    generatedAt: '', rootId: 'R',
    collections: [
      { id: 'R', name: 'Raiz', parentId: null, color: '#000', childIds: ['P', 'Q'], trackIds: [], zipUrls: [], zipKey: '' },
      { id: 'P', name: 'Playlist P', parentId: 'R', color: '#000', childIds: ['P1'], trackIds: ['p1', 'p2'], zipUrls: [], zipKey: '' },
      { id: 'P1', name: 'Sub', parentId: 'P', color: '#000', childIds: [], trackIds: ['p3'], zipUrls: [], zipKey: '' },
      { id: 'Q', name: 'Playlist Q', parentId: 'R', color: '#000', childIds: [], trackIds: ['q1'], zipUrls: [], zipKey: '' },
    ],
    tracks: [t('p1', 'P', 'sA'), t('p2', 'P', 'sA'), t('p3', 'P1', 'sA'), t('q1', 'Q', 'sA')],
  } as unknown as Catalog;
  const ix = new CatalogIndex(cat);

  it('dentro da playlist, uma vez só; contador sem repetição entre subpastas', () => {
    expect(ix.tracksOf('P').map((x) => x.id)).toEqual(['p1']);
    expect(ix.totalTracks('P')).toBe(1);
  });
  it('busca e aleatório: uma entrada por música', () => {
    expect(ix.searchableTracks.map((x) => x.songId)).toEqual(['sA']);
    expect(ix.allTracksUnder('R')).toHaveLength(1);
  });
  it('sabe em quais playlists a música está', () => {
    expect(ix.playlistsOf(ix.searchableTracks[0]).map((c) => c.id)).toEqual(['P', 'P1', 'Q']);
  });
});
