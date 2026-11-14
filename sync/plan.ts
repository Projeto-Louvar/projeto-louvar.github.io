import { createHash } from 'node:crypto';
import type { Catalog, Collection, Track } from '../shared/catalog';
import { safeAssetName, slugify } from './names';
import { bonusIds, freeEligibleIds } from '../shared/bonus';
import { bestCopy } from '../shared/quality';
import { titlesFor, type TitleOverrides } from './cleanTitles';
import { planSongs } from './songs';
import { audioNameFor } from './titles';
import type { DriveSnapshot, TreeCollection } from './tree';

export const PALETTE = ['#1F4E79', '#7A1F3D', '#2E6B3A', '#8A4B0F', '#4B2E83', '#0F6E6E', '#9B2C2C', '#3D4F5C'];

export interface Quality { dur: number; kbps: number }
export interface UploadJob { fileId: string; fileName: string; tag: string; assetName: string; url: string; size: number; convert?: boolean }
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
  titleOverrides: TitleOverrides = {},
  quality: Map<string, Quality> = new Map(),
): SyncPlan {
  const files = new Map(snap.files.map((f) => [f.id, f]));
  // Nome da música e cantor, limpos com o contexto da pasta e do acervo inteiro
  const titles = titlesFor(snap.files.map((f) => ({ id: f.id, name: f.convert ? audioNameFor(f.name) : f.name, folderId: f.parentId })), titleOverrides);
  const prevTracks = new Map((prev?.tracks ?? []).map((t) => [t.id, t]));
  const prevCols = new Map((prev?.collections ?? []).map((c) => [c.id, c]));
  // arquivo próprio de cada faixa anterior (antes da deduplicação, url era o arquivo próprio)
  const ownUrl = (t: Track) => (t.srcUrl !== undefined ? t.srcUrl : t.url);
  const urlByMd5 = new Map<string, string>();
  for (const t of prev?.tracks ?? []) if (ownUrl(t)) urlByMd5.set(t.md5, ownUrl(t));
  const uploadedUrls = new Set(urlByMd5.values()); // já existem no GitHub

  const uploads: UploadJob[] = [];
  const tagOf = new Map<string, string>(); // coleção → nome (para o .zip)
  const zips: ZipJob[] = [];
  const tracks: Track[] = [];
  const collections: Collection[] = [];

  tree.forEach((tc, i) => {
    const tag = tagFor(tc.id);
    const prefix = `${repoBase}/releases/download/${tag}/`;
    const taken = new Set<string>();
    for (const t of prev?.tracks ?? []) for (const u of [t.url, ownUrl(t)]) if (u.startsWith(prefix)) taken.add(decodeURIComponent(u.slice(prefix.length)));
    // nomes pendentes de exclusão ainda existem no GitHub: não podem ser reaproveitados
    for (const u of prev?.pendingDeletes ?? []) if (u.startsWith(prefix)) taken.add(decodeURIComponent(u.slice(prefix.length)));

    const trackIds: string[] = [];
    const md5s: string[] = [];
    for (const fid of tc.fileIds) {
      const f = files.get(fid)!;
      const old = prevTracks.get(f.id);
      let url: string;
      if (old && old.md5 === f.md5 && ownUrl(old)) url = ownUrl(old);
      else if (urlByMd5.has(f.md5)) url = urlByMd5.get(f.md5)!;
      else {
        // Vídeo convertido: o nome leva parte do md5 do original, então "já existe no GitHub" basta para pular
        const assetName = f.convert
          ? safeAssetName(`${f.name.replace(/\.[^.]+$/, '')}-${f.md5.slice(0, 8)}.m4a`, taken)
          : safeAssetName(f.name, taken);
        url = assetUrl(repoBase, tag, assetName);
        uploads.push({ fileId: f.id, fileName: f.name, tag, assetName, url, size: f.size, ...(f.convert ? { convert: true } : {}) });
        urlByMd5.set(f.md5, url);
      }
      const { title, artist } = titles.get(f.id)!;
      const fileName = f.convert ? audioNameFor(f.name) : f.name;
      // tamanho do áudio já convertido, se conhecido (o do Drive é o do vídeo)
      const size = f.convert && old && ownUrl(old) === url ? (old.srcSize ?? old.size) : f.size;
      const q = quality.get(f.md5) ?? (old && old.md5 === f.md5 && old.dur !== undefined ? { dur: old.dur, kbps: old.kbps ?? 0 } : undefined);
      tracks.push({ id: f.id, title, artist, fileName, collectionId: tc.id, md5: f.md5, size, url, srcUrl: url, ...(q ? { dur: q.dur, kbps: q.kbps } : {}) });
      trackIds.push(f.id);
    }
    tagOf.set(tc.id, tc.name);

    const old = prevCols.get(tc.id);
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

  // ---- mesma música: uma vez só no site, em quantas playlists precisar ----
  const songs = planSongs(tracks);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const eligible = freeEligibleIds(collections, tracks, snap.rootId);
  const locked = bonusIds(collections, snap.rootId);
  // arquivos necessários: a melhor cópia de cada música e, se ela estiver trancada no bônus, a melhor cópia livre
  const members = new Map<string, Track[]>();
  for (const t of tracks) { const k = songs.songOf.get(t.id)!; (members.get(k) ?? members.set(k, []).get(k)!).push(t); }
  const needed = new Set<string>();
  for (const [songId, list] of members) {
    const canon = byId.get(songs.canonical.get(songId)!)!;
    needed.add(canon.srcUrl!);
    const free = list.filter((t) => eligible.has(t.id));
    if (free.length && locked.has(canon.collectionId)) needed.add(bestCopy(free).srcUrl!);
  }
  const keptUploads = uploads.filter((u) => needed.has(u.url));
  const queued = new Set(keptUploads.map((u) => u.url));
  for (const t of tracks) {
    const songId = songs.songOf.get(t.id)!;
    const canon = byId.get(songs.canonical.get(songId)!)!;
    t.songId = songId;
    if (!t.artist && songs.artistFound.has(t.id)) t.artist = songs.artistFound.get(t.id)!;
    // arquivo próprio só existe se já está no GitHub ou vai ser enviado agora
    if (!uploadedUrls.has(t.srcUrl!) && !queued.has(t.srcUrl!)) t.srcUrl = '';
  }
  for (const t of tracks) {
    const canon = byId.get(songs.canonical.get(t.songId!)!)!;
    if (canon === t) continue;
    // toca/baixa a melhor cópia; o nome no .zip leva a extensão do arquivo canônico
    t.url = canon.srcUrl!;
    t.srcSize = t.size;
    t.size = canon.size;
    const ext = canon.fileName.match(/\.[^.]+$/)?.[0] ?? '';
    t.fileName = t.fileName.replace(/\.[^.]+$/, '') + ext;
  }
  for (const c of collections) {
    // dentro da mesma playlist, a música aparece uma vez só, na primeira posição
    const seen = new Set<string>();
    c.trackIds = c.trackIds.filter((id) => { const k = byId.get(id)!.songId!; if (seen.has(k)) return false; seen.add(k); return true; });
    const md5s = c.trackIds.map((id) => { const t = byId.get(id)!; return byId.get(songs.canonical.get(t.songId!)!)!.md5; });
    const zipKey = c.trackIds.length ? zipKeyFor(md5s) : '';
    const old = prevCols.get(c.id);
    const keepZip = !!old && old.zipKey === zipKey && old.zipUrls.length > 0;
    c.zipUrls = c.trackIds.length && keepZip ? [...old!.zipUrls] : c.trackIds.length ? [...(old?.zipUrls ?? [])] : [];
    c.zipKey = c.trackIds.length ? (old?.zipKey ?? '') : '';
    if (c.trackIds.length && !keepZip) zips.push({ collectionId: c.id, tag: tagFor(c.id), zipKey, baseName: slugify(tagOf.get(c.id) ?? c.name) || 'colecao' });
  }

  return { catalog: { generatedAt: now, rootId: snap.rootId, collections, tracks }, uploads: keptUploads, zips };
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
  for (const t of cat.tracks) { urls.add(t.url); if (t.srcUrl) urls.add(t.srcUrl); } // arquivo próprio não é apagado
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
