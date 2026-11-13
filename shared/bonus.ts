// Bônus = "Biblioteca Organizada por Momento" e as pastas de lançamentos ("Lançamentos 2027"...),
// estejam onde estiverem no Drive. A versão pública mostra essas coleções trancadas;
// a versão completa (endereço secreto, enviado depois do comprovante) libera tudo.
import type { Catalog, Collection } from './catalog';

export const BONUS_PATTERN = /lan[cç]amentos?|organizada por momento/i;

/** Coleções bônus e tudo o que está dentro delas. */
export function bonusIds(collections: Collection[], rootId: string): Set<string> {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const out = new Set<string>();
  const mark = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    byId.get(id)?.childIds.forEach(mark);
  };
  for (const c of collections) if (c.id !== rootId && BONUS_PATTERN.test(c.name)) mark(c.id);
  return out;
}

/**
 * Catálogo da versão pública: as coleções bônus continuam aparecendo (nome, capa, quantidade),
 * mas sem as músicas nem os .zip, para que os links de áudio não fiquem expostos.
 */
export function publicCatalog(catalog: Catalog): Catalog {
  const locked = bonusIds(catalog.collections, catalog.rootId);
  return {
    ...catalog,
    pendingDeletes: undefined,
    collections: catalog.collections.map((c) => (locked.has(c.id) ? { ...c, zipUrls: [], zipKey: '' } : c)),
    tracks: catalog.tracks.filter((t) => !locked.has(t.collectionId)),
  };
}
