export interface DriveFolder { id: string; name: string; parentId: string | null }
export interface DriveAudio { id: string; name: string; parentId: string; md5: string; size: number; convert?: boolean }
export interface SkippedFile { name: string; parentId: string; mimeType: string }
export interface DriveSnapshot { rootId: string; folders: DriveFolder[]; files: DriveAudio[]; skipped?: string[]; skippedFiles?: SkippedFile[] }
import { BONUS_PATTERN } from '../shared/bonus';

export interface TreeCollection { id: string; name: string; parentId: string | null; childIds: string[]; fileIds: string[] }

export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildTree(snap: DriveSnapshot): TreeCollection[] {
  const folders = new Map(snap.folders.map((f) => [f.id, f]));
  const children = new Map<string, string[]>();
  const filesOf = new Map<string, DriveAudio[]>();
  for (const f of snap.folders) if (f.parentId && folders.has(f.parentId)) push(children, f.parentId, f.id);
  for (const a of snap.files) if (folders.has(a.parentId)) push(filesOf, a.parentId, a);

  const out: TreeCollection[] = [];

  // Devolve os ids que representam esta pasta na posição atual ([] se sumiu).
  const visit = (id: string, parentId: string | null): string[] => {
    const folder = folders.get(id)!;
    const files = (filesOf.get(id) ?? []).slice().sort((a, b) => compareNames(a.name, b.name));
    const kids = (children.get(id) ?? []).slice().sort((a, b) => compareNames(folders.get(a)!.name, folders.get(b)!.name));
    const node: TreeCollection = { id, name: folder.name, parentId, childIds: [], fileIds: files.map((f) => f.id) };
    const at = out.length;
    out.push(node);
    for (const k of kids) node.childIds.push(...visit(k, id));

    const isRoot = parentId === null;
    if (isRoot || node.fileIds.length > 0) return [id];
    if (node.childIds.length === 0) {
      out.splice(at, 1);
      return [];
    }
    // Pasta com uma só subpasta some e a subpasta toma o lugar, exceto pastas bônus (o nome delas define o bônus)
    if (node.childIds.length === 1 && !BONUS_PATTERN.test(folder.name)) {
      out.splice(at, 1);
      const only = out.find((c) => c.id === node.childIds[0])!;
      only.parentId = parentId;
      return [only.id];
    }
    return [id];
  };

  visit(snap.rootId, null);
  return out;
}

/** Diagnóstico para o resumo do sync: o que existe no Drive mas não aparece no site, e por quê. */
export function driveReport(snap: DriveSnapshot): string[] {
  const folders = new Map(snap.folders.map((f) => [f.id, f]));
  const path = (id: string): string => {
    const parts: string[] = [];
    for (let f = folders.get(id); f && f.parentId; f = f.parentId ? folders.get(f.parentId) : undefined) parts.unshift(f.name);
    return parts.join(' > ') || '(pasta principal)';
  };
  const audioIn = new Map<string, number>();
  for (const a of snap.files) {
    for (let f = folders.get(a.parentId); f; f = f.parentId ? folders.get(f.parentId) : undefined) audioIn.set(f.id, (audioIn.get(f.id) ?? 0) + 1);
  }
  const otherIn = new Map<string, number>();
  for (const s of snap.skippedFiles ?? []) otherIn.set(s.parentId, (otherIn.get(s.parentId) ?? 0) + 1);

  const kind = (s: SkippedFile) =>
    s.mimeType === 'application/vnd.google-apps.shortcut' ? 'atalho'
    : /\.[a-z0-9]{2,5}$/i.test(s.name) ? s.name.slice(s.name.lastIndexOf('.')).toLowerCase() : s.mimeType || 'sem extensão';
  const byKind = new Map<string, number>();
  for (const s of snap.skippedFiles ?? []) byKind.set(kind(s), (byKind.get(kind(s)) ?? 0) + 1);

  const empty = snap.folders.filter((f) => f.parentId && !audioIn.get(f.id))
    // só a mais externa de cada ramo vazio
    .filter((f) => !(f.parentId && folders.get(f.parentId)?.parentId && !audioIn.get(f.parentId)));
  const bonus = snap.folders.filter((f) => f.parentId && BONUS_PATTERN.test(f.name));

  return [
    `- Arquivos ignorados por tipo: ${[...byKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(', ') || 'nenhum'}`,
    `- Pastas sem nenhum áudio (não aparecem no site): ${empty.length}`,
    ...empty.slice(0, 40).map((f) => `  - ${path(f.id)} — ${otherIn.get(f.id) ?? 0} arquivo(s) de outro tipo`),
    `- Pastas bônus encontradas no Drive: ${bonus.length}`,
    ...bonus.map((f) => `  - ${path(f.id)} — ${audioIn.get(f.id) ?? 0} áudio(s), ${otherIn.get(f.id) ?? 0} outro(s)`),
  ];
}
