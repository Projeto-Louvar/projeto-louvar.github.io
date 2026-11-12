import { createHash } from 'node:crypto';
import type { Catalog, Collection, Track } from '../shared/catalog';
import { safeAssetName, slugify } from './names';
import { parseTrackName } from './titles';
import type { DriveSnapshot, TreeCollection } from './tree';

export const PALETTE = ['#1F4E79', '#7A1F3D', '#2E6B3A', '#8A4B0F', '#4B2E83', '#0F6E6E', '#9B2C2C', '#3D4F5C'];

export interface UploadJob { fileId: string; fileName: string; tag: string; assetName: string; url: string; size: number }
export interface ZipJob { collectionId: string; tag: string; zipKey: string; baseName: string }
export interface SyncPlan { catalog: Catalog; uploads: UploadJob[]; zips: ZipJob[] }

// O GitHub recusa tags terminadas em "-" (HTTP 422). Ids do Drive têm tamanho fixo, então o sufixo não colide.
export const tagFor = (collectionId: string): string =>
  collectionId.endsWith("-") ? `c-${collectionId}0` : `c-${collectionId}`;

export const assetUrl = (repoBase: string, tag: string, name: string): string =>
  `${repoBase}/releases/download/${tag}/${encodeURIComponent(name)}`;

export function zipKeyFor(md5s: string[]): string {
  return createHash('sha1').update([...md5s].sort().join(',')).digest('hex').slice(0, 16);
}

export function planSync(
  snap: DriveSnapshot,
  tree: TreeCollection[],
  prev: Catalog | null,
  repoBase: string,
  now: string,
): SyncPlan {
  const files = new Map(snap.files.map((f) => [f.id, f]));
  const prevTracks = new Map((prev?.tracks ?? []).map((t) => [t.id, t]));
  const prevCols = new Map((prev?.collections ?? []).map((c) => [c.id, c]));
  const urlByMd5 = new Map<string, string>();
  for (const t of prev?.tracks ?? []) if (t.url) urlByMd5.set(t.md5, t.url);

  const uploads: UploadJob[] = [];
  const zips: ZipJob[] = [];
  const tracks: Track[] = [];
  const collections: Collection[] = [];

  tree.forEach((tc, i) => {
    const tag = tagFor(tc.id);
    const prefix = `${repoBase}/releases/download/${tag}/`;
    const taken = new Set<string>();
    for (const t of prev?.tracks ?? []) if (t.url.startsWith(prefix)) taken.add(decodeURIComponent(t.url.slice(prefix.length)));
    // nomes pendentes de exclusão ainda existem no GitHub: não podem ser reaproveitados
    for (const u of prev?.pendingDeletes ?? []) if (u.startsWith(prefix)) taken.add(decodeURIComponent(u.slice(prefix.length)));

    const trackIds: string[] = [];
    const md5s: string[] = [];
    for (const fid of tc.fileIds) {
      const f = files.get(fid)!;
      const old = prevTracks.get(f.id);
      let url: string;
      if (old && old.md5 === f.md5 && old.url) url = old.url;
      else if (urlByMd5.has(f.md5)) url = urlByMd5.get(f.md5)!;
      else {
        const assetName = safeAssetName(f.name, taken);
        url = assetUrl(repoBase, tag, assetName);
        uploads.push({ fileId: f.id, fileName: f.name, tag, assetName, url, size: f.size });
        urlByMd5.set(f.md5, url);
      }
      const { title, artist } = parseTrackName(f.name);
      tracks.push({ id: f.id, title, artist, fileName: f.name, collectionId: tc.id, md5: f.md5, size: f.size, url });
      trackIds.push(f.id);
      md5s.push(f.md5);
    }

    const zipKey = trackIds.length ? zipKeyFor(md5s) : '';
    const old = prevCols.get(tc.id);
    const keepZip = !!old && old.zipKey === zipKey && old.zipUrls.length > 0;
    if (trackIds.length && !keepZip) zips.push({ collectionId: tc.id, tag, zipKey, baseName: slugify(tc.name) || 'colecao' });

    collections.push({
      id: tc.id,
      name: tc.name,
      parentId: tc.parentId,
      color: PALETTE[i % PALETTE.length],
      childIds: [...tc.childIds],
      trackIds,
      zipUrls: trackIds.length ? [...(old?.zipUrls ?? [])] : [],
      zipKey: trackIds.length ? (old?.zipKey ?? '') : '',
    });
  });

  return { catalog: { generatedAt: now, rootId: snap.rootId, collections, tracks }, uploads, zips };
}

export function finalizeCatalog(cat: Catalog, notReady: Set<string>, prev: Catalog | null = null): Catalog {
  const prevTracks = new Map((prev?.tracks ?? []).map((t) => [t.id, t]));
  const tracks: Track[] = [];
  for (const t of cat.tracks) {
    if (!notReady.has(t.url)) {
      tracks.push(t);
      continue;
    }
    // upload pendente: mantém a versão anterior (ainda válida); o md5 antigo faz a próxima execução tentar de novo
    const old = prevTracks.get(t.id);
    if (old && !notReady.has(old.url)) tracks.push({ ...old, collectionId: t.collectionId });
  }
  const ready = new Set(tracks.map((t) => t.id));
  const cols = new Map(cat.collections.map((c) => [c.id, { ...c, trackIds: c.trackIds.filter((id) => ready.has(id)) }]));
  const memo = new Map<string, number>();
  const total = (id: string): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const c = cols.get(id)!;
    const n = c.trackIds.length + c.childIds.reduce((s, k) => s + (cols.has(k) ? total(k) : 0), 0);
    memo.set(id, n);
    return n;
  };
  const keep = new Set([...cols.keys()].filter((id) => id === cat.rootId || total(id) > 0));
  const collections = [...cols.values()]
    .filter((c) => keep.has(c.id))
    .map((c) => ({
      ...c,
      childIds: c.childIds.filter((k) => keep.has(k)),
      zipUrls: c.trackIds.length ? c.zipUrls : [],
      zipKey: c.trackIds.length ? c.zipKey : '',
    }));
  return { ...cat, collections, tracks };
}

function allUrls(cat: Catalog): Set<string> {
  const urls = new Set<string>();
  for (const t of cat.tracks) urls.add(t.url);
  for (const c of cat.collections) for (const u of c.zipUrls) urls.add(u);
  return urls;
}

export function orphanUrls(prev: Catalog | null, next: Catalog): string[] {
  if (!prev) return [];
  const used = allUrls(next);
  return [...allUrls(prev)].filter((u) => !used.has(u));
}

// O zip só vale se cada faixa da coleção tem exatamente a url planejada; faixa que caiu para a versão anterior geraria zip com áudio velho.
export function zipReady(collectionId: string, finalCat: Catalog, planned: Catalog): boolean {
  const plannedCol = planned.collections.find((c) => c.id === collectionId);
  const finalCol = finalCat.collections.find((c) => c.id === collectionId);
  if (!plannedCol || !finalCol || finalCol.trackIds.length === 0) return false;
  if (finalCol.trackIds.length !== plannedCol.trackIds.length) return false;
  const plannedUrl = new Map(planned.tracks.map((t) => [t.id, t.url]));
  const finalUrl = new Map(finalCat.tracks.map((t) => [t.id, t.url]));
  return finalCol.trackIds.every((id) => finalUrl.get(id) !== undefined && finalUrl.get(id) === plannedUrl.get(id));
}

export function deletableNow(prev: Catalog | null, next: Catalog): string[] {
  const used = allUrls(next);
  return (prev?.pendingDeletes ?? []).filter((u) => !used.has(u));
}

export function nextPendingDeletes(prev: Catalog | null, next: Catalog, extra: string[], deletedNow: string[]): string[] {
  const used = allUrls(next);
  const done = new Set(deletedNow);
  const all = [...orphanUrls(prev, next), ...extra, ...(prev?.pendingDeletes ?? [])];
  return [...new Set(all)].filter((u) => !used.has(u) && !done.has(u));
}

export function massDeletionBlocked(count: number, prev: Catalog | null): boolean {
  const total = prev ? allUrls(prev).size : 0;
  return count > 20 && count > total * 0.3;
}

export const REFRESH_AFTER_MS = 30 * 86_400_000;

// O GitHub desativa o `schedule` após 60 dias sem atividade: mesmo sem mudanças, renova o timestamp a cada 30 dias para forçar um commit.
export function keepGeneratedAt(prev: Catalog | null, next: Catalog, nowMs: number): boolean {
  if (!prev) return false;
  const strip = (x: Catalog) => JSON.stringify({ ...x, generatedAt: '' });
  if (strip(prev) !== strip(next)) return false;
  const at = Date.parse(prev.generatedAt);
  return Number.isFinite(at) && nowMs - at < REFRESH_AFTER_MS;
}
