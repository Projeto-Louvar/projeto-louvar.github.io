import type { Catalog, Collection, Track } from '../../shared/catalog';

export interface HomeSection { title: string; collections: Collection[] }

export class CatalogIndex {
  private cols: Map<string, Collection>;
  private trks: Map<string, Track>;
  private totals = new Map<string, number>();

  constructor(readonly data: Catalog) {
    this.cols = new Map(data.collections.map((c) => [c.id, c]));
    this.trks = new Map(data.tracks.map((t) => [t.id, t]));
  }

  get root(): Collection {
    return this.cols.get(this.data.rootId)!;
  }

  collection(id: string): Collection | undefined {
    return this.cols.get(id);
  }

  track(id: string): Track | undefined {
    return this.trks.get(id);
  }

  tracksOf(id: string): Track[] {
    return (this.cols.get(id)?.trackIds ?? []).map((t) => this.trks.get(t)).filter((t): t is Track => !!t);
  }

  childrenOf(id: string): Collection[] {
    return (this.cols.get(id)?.childIds ?? []).map((c) => this.cols.get(c)).filter((c): c is Collection => !!c);
  }

  totalTracks(id: string): number {
    const hit = this.totals.get(id);
    if (hit !== undefined) return hit;
    const c = this.cols.get(id);
    const n = c ? c.trackIds.length + c.childIds.reduce((s, k) => s + this.totalTracks(k), 0) : 0;
    this.totals.set(id, n);
    return n;
  }

  homeSections(): HomeSection[] {
    const sections: HomeSection[] = [];
    const others: Collection[] = [];
    if (this.root.trackIds.length) others.push(this.root);
    for (const c of this.childrenOf(this.root.id)) {
      if (c.childIds.length) sections.push({ title: c.name, collections: this.childrenOf(c.id) });
      if (c.trackIds.length) others.push(c);
    }
    if (others.length) sections.push({ title: 'Outras', collections: others });
    return sections;
  }

  backTarget(id: string): string | null {
    const c = this.cols.get(id);
    const p = c?.parentId ? this.cols.get(c.parentId) : undefined;
    if (!p || p.id === this.data.rootId) return null;
    if (p.parentId === this.data.rootId && p.trackIds.length === 0) return null;
    return p.id;
  }
}

export async function loadCatalog(fetchFn: typeof fetch = fetch, url = './catalog.json'): Promise<Catalog> {
  const res = await fetchFn(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Catalog;
}
