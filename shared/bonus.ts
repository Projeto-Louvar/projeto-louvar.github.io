// Bônus = "Biblioteca Organizada por Momento" e as pastas de lançamentos ("Lançamentos 2027"...),
// estejam onde estiverem no Drive. A versão pública mostra essas coleções trancadas;
// a versão completa (endereço secreto, enviado depois do comprovante) libera tudo.
import type { Catalog, Collection } from './catalog';

export const BONUS_PATTERN = /lan[cç]amentos?|organizada por momento/i;

// Exceção pedida: os Hinos Infantis continuam grátis mesmo existindo também dentro do bônus
export const KEEP_FREE_PATTERN = /infantis/i;

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
 * Música que está no bônus fica só no bônus: sai das coleções comuns (menos as de KEEP_FREE_PATTERN).
 * dropZips: a coleção que perdeu músicas deixa de oferecer o .zip antigo (que ainda as conteria).
 */
export function withExclusiveBonus(catalog: Catalog, opts: { dropZips?: boolean } = {}): Catalog {
  const bonus = bonusIds(catalog.collections, catalog.rootId);
  const bonusMd5 = new Set(catalog.tracks.filter((t) => bonus.has(t.collectionId)).map((t) => t.md5));
  const keepFree = new Set(catalog.collections.filter((c) => !bonus.has(c.id) && KEEP_FREE_PATTERN.test(c.name)).map((c) => c.id));
  const removed = new Set(
    catalog.tracks.filter((t) => !bonus.has(t.collectionId) && !keepFree.has(t.collectionId) && bonusMd5.has(t.md5)).map((t) => t.id),
  );
  if (!removed.size) return catalog;
  return {
    ...catalog,
    collections: catalog.collections.map((c) => {
      const trackIds = c.trackIds.filter((id) => !removed.has(id));
      if (trackIds.length === c.trackIds.length) return c;
      return opts.dropZips ? { ...c, trackIds, zipUrls: [], zipKey: '' } : { ...c, trackIds };
    }),
    tracks: catalog.tracks.filter((t) => !removed.has(t.id)),
  };
}

/**
 * Catálogo da versão pública: músicas repetidas ficam só no bônus; as do bônus continuam com
 * nome e cantor (para aparecerem trancadas na busca), mas sem o link do áudio nem os .zip.
 */
export function publicCatalog(catalog: Catalog): Catalog {
  const c = withExclusiveBonus(catalog, { dropZips: true });
  const locked = bonusIds(c.collections, c.rootId);
  return {
    ...c,
    pendingDeletes: undefined,
    collections: c.collections.map((col) => (locked.has(col.id) ? { ...col, zipUrls: [], zipKey: '' } : col)),
    tracks: c.tracks.map((t) => (locked.has(t.collectionId) ? { ...t, url: '' } : t)),
  };
}

/** Catálogo da versão completa: só a regra de exclusividade (o .zip antigo pode ficar, tudo é liberado). */
export function fullCatalog(catalog: Catalog): Catalog {
  const c = withExclusiveBonus(catalog);
  return { ...c, pendingDeletes: undefined };
}
