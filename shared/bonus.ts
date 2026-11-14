// Bônus = "Biblioteca Organizada por Momento" e as pastas de lançamentos ("Lançamentos 2027"...),
// estejam onde estiverem no Drive. A versão pública mostra essas coleções trancadas;
// a versão completa (endereço secreto, enviado depois do comprovante) libera tudo.
import type { Catalog, Collection, Track } from './catalog';
import { bestCopy } from './quality';

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
 * Faixas que a versão grátis pode tocar: fora do bônus e cujo arquivo próprio não é um arquivo do bônus
 * (mesmo md5), salvo as coleções de KEEP_FREE_PATTERN. Usado no sync e no build, para os dois concordarem.
 */
export function freeEligibleIds(collections: Collection[], tracks: Track[], rootId: string): Set<string> {
  const bonus = bonusIds(collections, rootId);
  const bonusMd5 = new Set(tracks.filter((t) => bonus.has(t.collectionId)).map((t) => t.md5));
  const keepFree = new Set(collections.filter((c) => !bonus.has(c.id) && KEEP_FREE_PATTERN.test(c.name)).map((c) => c.id));
  return new Set(tracks.filter((t) => !bonus.has(t.collectionId) && (keepFree.has(t.collectionId) || !bonusMd5.has(t.md5))).map((t) => t.id));
}

/**
 * Música que está no bônus fica só no bônus: sai das coleções comuns quando é o mesmo arquivo (mesmo md5),
 * menos as de KEEP_FREE_PATTERN. dropZips: coleção que perdeu músicas deixa de oferecer o .zip antigo.
 */
export function withExclusiveBonus(catalog: Catalog, opts: { dropZips?: boolean } = {}): Catalog {
  const bonus = bonusIds(catalog.collections, catalog.rootId);
  const eligible = freeEligibleIds(catalog.collections, catalog.tracks, catalog.rootId);
  const removed = new Set(catalog.tracks.filter((t) => !bonus.has(t.collectionId) && !eligible.has(t.id)).map((t) => t.id));
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
 * Catálogo da versão pública:
 * - músicas repetidas com o bônus (mesmo arquivo) ficam só no bônus;
 * - cada faixa livre toca a MELHOR CÓPIA LIVRE da mesma música, nunca um arquivo do bônus
 *   (a melhor cópia geral pode estar numa pasta trancada); coleção com faixa trocada perde o .zip;
 * - as do bônus ficam com nome e cantor (aparecem trancadas na busca), mas sem link de áudio nem .zip.
 */
export function publicCatalog(catalog: Catalog): Catalog {
  const c = withExclusiveBonus(catalog, { dropZips: true });
  const locked = bonusIds(c.collections, c.rootId);
  // cópias livres disponíveis (já enviadas) por música
  const freeCopies = new Map<string, Track[]>();
  for (const t of c.tracks) {
    if (locked.has(t.collectionId) || t.srcUrl === '') continue;
    const k = t.songId ?? t.md5;
    (freeCopies.get(k) ?? freeCopies.set(k, []).get(k)!).push(t);
  }
  const lockedUrls = new Set(c.tracks.filter((t) => locked.has(t.collectionId)).map((t) => t.srcUrl ?? t.url).filter(Boolean));
  const changedCols = new Set<string>();
  const dropped = new Set<string>();
  const tracks = c.tracks.flatMap((t): Track[] => {
    if (locked.has(t.collectionId)) return [{ ...t, url: '' }];
    const copies = freeCopies.get(t.songId ?? t.md5) ?? [];
    const best = copies.length ? bestCopy(copies) : null;
    const url = best ? (best.srcUrl ?? best.url) : t.url;
    if (!best && (t.srcUrl === '' || lockedUrls.has(t.url))) { dropped.add(t.id); return []; } // sem cópia livre: não entra
    if (url !== t.url) changedCols.add(t.collectionId);
    return [best && url !== t.url ? { ...t, url, size: best.size } : t];
  });
  return {
    ...c,
    pendingDeletes: undefined,
    collections: c.collections.map((col) => {
      const trackIds = dropped.size ? col.trackIds.filter((id) => !dropped.has(id)) : col.trackIds;
      const noZip = locked.has(col.id) || changedCols.has(col.id) || trackIds.length !== col.trackIds.length;
      return noZip ? { ...col, trackIds, zipUrls: [], zipKey: '' } : { ...col, trackIds };
    }),
    tracks,
  };
}

/** Catálogo da versão completa: só a regra de exclusividade (o .zip pode ficar, tudo é liberado). */
export function fullCatalog(catalog: Catalog): Catalog {
  const c = withExclusiveBonus(catalog);
  return { ...c, pendingDeletes: undefined };
}
