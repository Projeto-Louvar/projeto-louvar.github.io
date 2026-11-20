import { describe, expect, it } from 'vitest';
import { bonusIds, exclusiveIds, fullCatalog, publicCatalog, withExclusiveBonus } from '../../shared/bonus';
import type { Catalog, Collection, Track } from '../../shared/catalog';
import { CatalogIndex } from '../../web/src/catalogIndex';

const col = (id: string, name: string, parentId: string | null, childIds: string[], trackIds: string[], zip = false): Collection =>
  ({ id, name, parentId, childIds, trackIds, color: '#000', zipUrls: zip ? [`z/${id}.zip`] : [], zipKey: zip ? 'k' : '' });
const tr = (id: string, c: string): Track => ({ id, title: `Música ${id}`, artist: '', fileName: id, collectionId: c, md5: id, size: 1, url: `u/${id}` });
const data: Catalog = {
  generatedAt: '', rootId: 'R',
  collections: [
    col('R', 'Raiz', null, ['B', 'L'], []),
    col('B', 'Biblioteca', 'R', [], ['t1'], true),
    col('L', 'Lançamentos 2026', 'R', ['L1'], ['t2'], true),
    col('L1', 'Março', 'L', [], ['t3']),
  ],
  tracks: [tr('t1', 'B'), tr('t2', 'L'), tr('t3', 'L1')],
};

describe('bônus', () => {
  it('Para Cada Momento, Organizada por Momento e Lançamentos (qualquer ano) são bônus; Hinos Infantis não', () => {
    const names = ['Biblioteca Organizada por Momento', 'Lançamentos 2027', 'lancamentos', 'Hinos Infantis', 'Gospel Atual', 'Para Cada Momento'];
    const cols = names.map((n, i) => col(`c${i}`, n, 'R', [], []));
    const ids = bonusIds([col('R', 'Raiz', null, cols.map((c) => c.id), []), ...cols], 'R');
    expect(names.filter((_, i) => ids.has(`c${i}`))).toEqual(['Biblioteca Organizada por Momento', 'Lançamentos 2027', 'lancamentos', 'Para Cada Momento']);
  });

  it('pastas de lançamentos e tudo dentro delas', () => {
    expect([...bonusIds(data.collections, 'R')].sort()).toEqual(['L', 'L1']);
  });

  it('catálogo público não expõe áudio nem zip dos bônus, mas mantém nome e contagem', () => {
    const pub = publicCatalog(data);
    expect(pub.tracks.map((t) => t.id)).toEqual(['t1', 't2', 't3']); // nomes ficam, para a busca
    expect(pub.tracks.filter((t) => t.collectionId !== 'B').every((t) => t.url === '')).toBe(true);
    expect(JSON.stringify(pub)).not.toContain('u/t2');
    expect(JSON.stringify(pub)).not.toContain('z/L.zip');
    expect(pub.collections.find((c) => c.id === 'B')!.zipUrls).toEqual(['z/B.zip']);
    expect(new CatalogIndex(pub, { lockBonus: true }).totalTracks('L')).toBe(2);
  });

  it('versão pública tranca; versão completa libera', () => {
    const pub = new CatalogIndex(data, { lockBonus: true });
    expect(pub.isLocked('L')).toBe(true);
    expect(pub.isLocked('L1')).toBe(true);
    expect(pub.isLocked('B')).toBe(false);
    expect(pub.tracksOf('L')).toEqual([]);
    expect(pub.track('t2')).toBeUndefined();
    expect(pub.playableTracks.map((t) => t.id)).toEqual(['t1']);

    const full = new CatalogIndex(data);
    expect(full.isLocked('L')).toBe(false);
    expect(full.tracksOf('L').map((t) => t.id)).toEqual(['t2']);
    expect(full.playableTracks).toHaveLength(3);
  });
});

describe('música repetida fica só no bônus', () => {
  const md = (id: string, c: string, md5: string): Track => ({ ...tr(id, c), md5 });
  const cat: Catalog = {
    generatedAt: '', rootId: 'R',
    collections: [
      col('R', 'Raiz', null, ['G', 'I', 'M'], []),
      col('G', 'Gospel', 'R', [], ['g1', 'g2'], true),
      col('I', 'Hinos Infantis', 'R', [], ['i1'], true),
      col('M', 'Lançamentos 2027', 'R', [], ['m1', 'm2'], true),
    ],
    tracks: [md('g1', 'G', 'aaa'), md('g2', 'G', 'bbb'), md('i1', 'I', 'ccc'), md('m1', 'M', 'aaa'), md('m2', 'M', 'ccc')],
  };

  it('sai da coleção comum, menos dos Hinos Infantis', () => {
    const ex = withExclusiveBonus(cat);
    expect(ex.collections.find((c) => c.id === 'G')!.trackIds).toEqual(['g2']);
    expect(ex.collections.find((c) => c.id === 'I')!.trackIds).toEqual(['i1']);
    expect(ex.collections.find((c) => c.id === 'M')!.trackIds).toEqual(['m1', 'm2']);
  });

  it('versão grátis: coleção que perdeu músicas não oferece o .zip antigo', () => {
    const pub = publicCatalog(cat);
    expect(pub.collections.find((c) => c.id === 'G')!.zipUrls).toEqual([]);
    expect(pub.collections.find((c) => c.id === 'I')!.zipUrls).toEqual(['z/I.zip']);
    expect(JSON.stringify(pub)).not.toContain('u/g1');
    expect(fullCatalog(cat).collections.find((c) => c.id === 'G')!.zipUrls).toEqual(['z/G.zip']);
  });

  it('busca da versão grátis encontra a música do bônus, trancada', () => {
    const ix = new CatalogIndex(publicCatalog(cat), { lockBonus: true });
    expect(ix.searchableTracks.map((t) => t.id).sort()).toEqual(['g2', 'i1', 'm1']); // m2 é o mesmo arquivo de i1: uma entrada só
    expect(ix.isLockedTrack(ix.searchableTracks.find((t) => t.id === 'm1')!)).toBe(true);
    expect(ix.playableTracks.map((t) => t.id).sort()).toEqual(['g2', 'i1']);
  });

  it('coleção que ficou vazia não aparece', () => {
    const only: Catalog = { ...cat, collections: cat.collections.map((c) => (c.id === 'G' ? { ...c, trackIds: ['g1'] } : c)), tracks: cat.tracks.filter((t) => t.id !== 'g2') };
    expect(new CatalogIndex(only).childrenOf('R').map((c) => c.id)).toEqual(['I', 'M']);
  });
});

describe('bônus na pasta nova: Lançamentos exclusivos, Para Cada Momento é curadoria', () => {
  const md = (id: string, c: string, md5: string, srcUrl = `u/${md5}`): Track => ({ ...tr(id, c), md5, url: srcUrl, srcUrl });
  const cat: Catalog = {
    generatedAt: '', rootId: 'R',
    collections: [
      col('R', 'Louvores -  2.0', null, ['G', 'P', 'L'], []),
      col('G', 'Gospel Atual', 'R', [], ['g1', 'g2'], true),
      col('P', 'Para Cada Momento', 'R', ['P1'], []),
      col('P1', 'Adoração Profunda', 'P', [], ['p1', 'p2'], true),
      col('L', 'Lançamentos', 'R', [], ['l1'], true),
    ],
    tracks: [md('g1', 'G', 'aaa'), md('g2', 'G', 'bbb'), md('p1', 'P1', 'aaa'), md('p2', 'P1', 'ppp'), md('l1', 'L', 'bbb')],
  };

  it('só Lançamentos é exclusivo', () => {
    expect([...exclusiveIds(cat.collections, 'R')]).toEqual(['L']);
    expect([...bonusIds(cat.collections, 'R')].sort()).toEqual(['L', 'P', 'P1']);
  });

  it('música de Para Cada Momento continua na playlist grátis; a de Lançamentos sai', () => {
    const g = withExclusiveBonus(cat).collections.find((c) => c.id === 'G')!;
    expect(g.trackIds).toEqual(['g1']); // g1 (também em Adoração Profunda) fica; g2 (também em Lançamentos) sai
  });

  it('versão grátis: nada trancado toca, e nenhum arquivo próprio (srcUrl) é exposto', () => {
    const pub = publicCatalog(cat);
    expect(pub.tracks.filter((t) => ['P1', 'L'].includes(t.collectionId)).every((t) => t.url === '')).toBe(true);
    expect(pub.tracks.find((t) => t.id === 'g1')!.url).toBe('u/aaa');
    expect(JSON.stringify(pub)).not.toContain('u/ppp'); // só existe na curadoria trancada
    expect(JSON.stringify(pub)).not.toContain('u/bbb'); // só existe em Lançamentos
    expect(pub.tracks.some((t) => 'srcUrl' in t)).toBe(false);
  });
});
