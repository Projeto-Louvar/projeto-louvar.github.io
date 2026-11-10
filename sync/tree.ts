export interface DriveFolder { id: string; name: string; parentId: string | null }
export interface DriveAudio { id: string; name: string; parentId: string; md5: string; size: number }
export interface DriveSnapshot { rootId: string; folders: DriveFolder[]; files: DriveAudio[]; skipped?: string[] }
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
    if (node.childIds.length === 1) {
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
