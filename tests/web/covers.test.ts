import { describe, expect, it } from 'vitest';
import type { Catalog, Collection } from '../../shared/catalog';
import { CatalogIndex } from '../../web/src/catalogIndex';
import { coverFor, creditList, type CoverMap } from '../../web/src/covers';

const col = (id: string, parentId: string | null, childIds: string[] = []): Collection => ({
  id, name: `Nome ${id}`, parentId, color: '#000', childIds, trackIds: [], zipUrls: [], zipKey: '',
});

// R ─ S ─ A ─ A1 ─ A2
//       └ B
const data: Catalog = {
  generatedAt: '', rootId: 'R', tracks: [],
  collections: [col('R', null, ['S']), col('S', 'R', ['A', 'B']), col('A', 'S', ['A1']), col('A1', 'A', ['A2']), col('A2', 'A1'), col('B', 'S')],
};
const idx = new CatalogIndex(data);
const covers: CoverMap = {
  S: { file: 'covers/S.webp', name: 'Seção antiga', artist: 'Ana', license: 'CC0', page: 'https://x/S' },
  A: { file: 'covers/A.webp', name: 'A', artist: 'Bia', license: 'CC BY 4.0', page: 'https://x/A' },
};

describe('coverFor', () => {
  it('usa a foto da própria coleção', () => {
    expect(coverFor(idx, 'A', covers)?.file).toBe('covers/A.webp');
  });
  it('herda do pai e do avô quando a coleção não tem foto', () => {
    expect(coverFor(idx, 'A1', covers)?.file).toBe('covers/A.webp');
    expect(coverFor(idx, 'A2', covers)?.file).toBe('covers/A.webp');
    expect(coverFor(idx, 'B', covers)?.file).toBe('covers/S.webp');
  });
  it('devolve null quando nenhum ancestral tem foto ou a coleção não existe', () => {
    expect(coverFor(idx, 'R', covers)).toBeNull();
    expect(coverFor(idx, 'nao-existe', covers)).toBeNull();
  });
});

describe('creditList', () => {
  it('lista os créditos com o nome atual da coleção (ou o salvo, se ela sumiu)', () => {
    const list = creditList(idx, { ...covers, Z: { file: 'covers/Z.webp', name: 'Antiga Z', artist: '', license: 'CC0', page: 'https://x/Z' } });
    expect(list.map((c) => c.collection)).toEqual(['Antiga Z', 'Nome A', 'Nome S']);
    expect(list.find((c) => c.collection === 'Antiga Z')?.artist).toBe('autor não informado');
  });
});

describe('capas do acervo novo, pelo nome da pasta', () => {
  it('toda pasta do mapa aponta para uma foto que existe', async () => {
    const { COVER_BY_NAME } = await import('../../web/src/coverNames');
    const data = (await import('../../web/src/coverData.json')).default as Record<string, { name: string }>;
    const owners = new Set(Object.values(data).map((c) => c.name));
    expect(Object.values(COVER_BY_NAME).filter((o) => !owners.has(o))).toEqual([]);
  });
  it('pasta de id novo recebe a foto pelo nome; "Vol. 01" herda do pai', () => {
    const col = (id: string, name: string, parentId: string | null, childIds: string[]): Collection =>
      ({ id, name, parentId, childIds, trackIds: [], color: '#000', zipUrls: [], zipKey: '' });
    const cat = { generatedAt: '', rootId: 'R', tracks: [], collections: [
      col('R', 'Louvores -  2.0', null, ['M']), col('M', 'Para Cada Momento', 'R', ['A']),
      col('A', 'Adoração Profunda', 'M', ['V']), col('V', 'Vol. 01', 'A', []),
    ] } as Catalog;
    const ix = new CatalogIndex(cat);
    expect(coverFor(ix, 'A')?.name).toBe('5. Adoração profunda');
    expect(coverFor(ix, 'V')?.name).toBe('5. Adoração profunda');
    expect(coverFor(ix, 'M')?.name).toBe('Biblioteca Organizada por Momento');
  });
});
