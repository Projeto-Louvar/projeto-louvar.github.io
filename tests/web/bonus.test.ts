import { describe, expect, it } from 'vitest';
import { bonusIds, publicCatalog } from '../../shared/bonus';
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
  it('Biblioteca Organizada por Momento e Lançamentos (qualquer ano) são bônus; Hinos Infantis não', () => {
    const names = ['Biblioteca Organizada por Momento', 'Lançamentos 2027', 'lancamentos', 'Hinos Infantis', 'Gospel Atual'];
    const cols = names.map((n, i) => col(`c${i}`, n, 'R', [], []));
    const ids = bonusIds([col('R', 'Raiz', null, cols.map((c) => c.id), []), ...cols], 'R');
    expect(names.filter((_, i) => ids.has(`c${i}`))).toEqual(['Biblioteca Organizada por Momento', 'Lançamentos 2027', 'lancamentos']);
  });

  it('pastas de lançamentos e tudo dentro delas', () => {
    expect([...bonusIds(data.collections, 'R')].sort()).toEqual(['L', 'L1']);
  });

  it('catálogo público não expõe áudio nem zip dos bônus, mas mantém nome e contagem', () => {
    const pub = publicCatalog(data);
    expect(pub.tracks.map((t) => t.id)).toEqual(['t1']);
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
