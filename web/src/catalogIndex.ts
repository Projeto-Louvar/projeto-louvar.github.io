import type { Catalog, Collection, Track } from '../../shared/catalog';

export interface HomeSection { title: string; collections: Collection[] }

// Pastas de lançamentos ("Lançamentos 2026", depois "Lançamentos 2027"...) formam a seção Bônus,
// estejam onde estiverem no Drive. Basta renomear a pasta no Drive para o site acompanhar.
export const BONUS_PATTERN = /lan[cç]amentos?/i;
export const BONUS_TITLE = 'Bônus';

/** Nome para mostrar: tira prefixos de organização do Drive ("Bônus 1 - ", "Louvores - "). */
export function displayName(name: string): string {
  return name.replace(/^\s*b[oô]nus\s*\d*\s*[-–:]\s*/i, '').replace(/^\s*louvores\s*[-–:]\s*/i, '').trim() || name;
}

export class CatalogIndex {
  private cols: Map<string, Collection>;
  private trks: Map<string, Track>;
  private totals = new Map<string, number>();

  constructor(readonly data: Catalog) {
    this.cols = new Map(data.collections.map((c) => [c.id, { ...c, name: displayName(c.name) }]));
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
    const isBonus = (c: Collection) => c.id !== this.root.id && BONUS_PATTERN.test(c.name);
    // Só a pasta de lançamentos mais externa (subpastas dela ficam dentro dela)
    const bonus = [...this.cols.values()].filter((c) => {
      if (!isBonus(c)) return false;
      for (let p = c.parentId ? this.cols.get(c.parentId) : undefined; p; p = p.parentId ? this.cols.get(p.parentId) : undefined) {
        if (isBonus(p)) return false;
      }
      return true;
    });
    const sections: HomeSection[] = [];
    const loose: Collection[] = [];
    if (this.root.trackIds.length) loose.push(this.root);
    for (const c of this.childrenOf(this.root.id)) {
      if (isBonus(c)) continue;
      if (c.childIds.length) sections.push({ title: c.name, collections: this.childrenOf(c.id).filter((k) => !isBonus(k)) });
      if (c.trackIds.length) loose.push(c);
    }
    // Coleções soltas na pasta principal (ex.: Hinos Infantis) entram na biblioteca, não num canto à parte
    if (loose.length) {
      if (sections.length) sections[0] = { ...sections[0], collections: [...sections[0].collections, ...loose] };
      else sections.push({ title: 'Biblioteca', collections: loose });
    }
    if (bonus.length) sections.push({ title: BONUS_TITLE, collections: bonus });
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
