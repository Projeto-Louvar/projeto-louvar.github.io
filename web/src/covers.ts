import type { CatalogIndex } from './catalogIndex';
import { COVER_BY_NAME, normName } from './coverNames';
import coverData from './coverData.json';

export interface Cover { file: string; name: string; artist: string; license: string; page: string }
export type CoverMap = Record<string, Cover>;

const defaultCovers = coverData as CoverMap;

// nome da pasta (normalizado) → foto, pelo mapa de nomes do acervo novo
const byName = new Map<string, Cover>();
for (const [folder, owner] of Object.entries(COVER_BY_NAME)) {
  const cover = Object.values(defaultCovers).find((c) => c.name === owner);
  if (cover) byName.set(normName(folder), cover);
}

/** Foto da coleção (pelo id ou pelo nome da pasta) ou, se ela não tiver, a do ancestral mais próximo. */
export function coverFor(idx: CatalogIndex, id: string, covers: CoverMap = defaultCovers): Cover | null {
  for (let c = idx.collection(id); c; c = c.parentId ? idx.collection(c.parentId) : undefined) {
    const hit = covers[c.id] ?? (covers === defaultCovers ? byName.get(normName(c.name)) : undefined);
    if (hit) return hit;
  }
  return null;
}

export interface Credit { collection: string; artist: string; license: string; page: string }

/** Créditos de todas as fotos, em ordem alfabética do nome da coleção. */
export function creditList(idx: CatalogIndex, covers: CoverMap = defaultCovers): Credit[] {
  return Object.entries(covers)
    .map(([id, c]) => ({
      collection: idx.collection(id)?.name ?? c.name,
      artist: c.artist || 'autor não informado',
      license: c.license,
      page: c.page,
    }))
    .sort((a, b) => a.collection.localeCompare(b.collection, 'pt-BR'));
}
