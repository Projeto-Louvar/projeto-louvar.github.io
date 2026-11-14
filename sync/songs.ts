// "Mesma música": cada música existe uma vez só no site, mas pode aparecer em várias playlists.
// Identidade = título normalizado + versão + cantor principal. Regras (validadas na simulação de 13/11/2026):
//   - mesmo arquivo (md5) é sempre a mesma música;
//   - ao vivo, acústico, playback, instrumental e remix são músicas diferentes da versão de estúdio;
//   - mesmo título com cantores diferentes são músicas diferentes;
//   - faixa sem cantor só junta com sinal forte: o título (com a versão) tem UM único cantor no acervo
//     e a duração (±3 s) ou, sem duração, o tamanho (±12%) é compatível. Na dúvida, não junta.
// Títulos e cantores já vêm limpos por cleanTitles.ts (com title-overrides.json aplicado).
import { bestCopy } from '../shared/quality';

export interface SongTrack {
  id: string; title: string; artist: string; fileName: string; md5: string; size: number;
  collectionId: string; dur?: number; kbps?: number;
}
export interface SongPlan {
  songOf: Map<string, string>;          // id da faixa → songId
  canonical: Map<string, string>;       // songId → id da faixa com a melhor cópia
  artistFound: Map<string, string>;     // faixa sem cantor → cantor achado no nome do arquivo
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s: string) => strip(s).replace(/[^a-z0-9]+/g, ' ').trim();
const VERSIONS: [RegExp, string][] = [
  [/\bplay ?back\b/, 'playback'], [/\binstrumental\b/, 'instrumental'], [/\bremix\b|\bmix\b/, 'remix'],
  [/\bac[uú]stic[oa]\b|\bacoustic\b|\bpiano e voz\b/, 'acustico'], [/\bao vivo\b|\blive\b/, 'aovivo'],
];

/** Cantor principal: antes de vírgula, "&", " e ", "feat". */
export function primaryArtist(artist: string): string {
  return words(strip(artist).split(/,|&|\s+e\s+|\bfeat\b|\bft\b/)[0] ?? '');
}

/** Versão da faixa, lida no título limpo e no nome original (a limpeza às vezes tira o "- Ao Vivo"). */
export function versionOf(title: string, fileName: string): string {
  const raw = strip(`${title} ${fileName}`);
  return VERSIONS.filter(([re]) => re.test(raw)).map(([, v]) => v).sort().join('+') || 'estudio';
}

/** Título sem versão, "feat.", parênteses, numeração e pontuação. */
export function baseTitle(title: string): string {
  let s = strip(title);
  s = s.replace(/\((?:[^()]*\b(?:feat|ft)\b[^()]*)\)/g, ' ').replace(/\b(?:feat|ft)\.?\s.*$/, ' ');
  s = s.replace(/\([^()]*\)|\[[^\]]*\]/g, ' ');
  s = s.replace(/\s-\s*(?:ao vivo|live|playback|acustico|instrumental).*$/, ' ');
  return s.replace(/^\s*\d{1,3}\s*[-.)]?\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function planSongs(tracks: SongTrack[]): SongPlan {
  // cantores conhecidos (2+ faixas) — com a grafia original mais comum, para mostrar no site
  const count = new Map<string, Map<string, number>>();
  for (const t of tracks) {
    const p = primaryArtist(t.artist);
    if (p.length < 4) continue;
    const m = count.get(p) ?? count.set(p, new Map()).get(p)!;
    const shown = t.artist.split(/,|&|\s+e\s+|\s+feat\.?\s|\s+ft\.?\s/i)[0].trim();
    m.set(shown, (m.get(shown) ?? 0) + 1);
  }
  const known = [...count].filter(([, m]) => [...m.values()].reduce((a, b) => a + b, 0) >= 2)
    .map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]] as const)
    .sort((a, b) => b[0].length - a[0].length);

  const artistFound = new Map<string, string>();
  const ident = new Map<string, { title: string; version: string; artist: string }>();
  for (const t of tracks) {
    let artist = primaryArtist(t.artist);
    if (!artist) {
      const title = ` ${words(t.title)} `;
      const hay = ` ${words(t.fileName.replace(/\.[^.]+$/, ''))} `;
      const hit = known.find(([k]) => hay.includes(` ${k} `) && !title.includes(` ${k} `));
      if (hit) { artist = hit[0]; artistFound.set(t.id, hit[1]); }
    }
    ident.set(t.id, { title: baseTitle(t.title), version: versionOf(t.title, t.fileName), artist });
  }

  // união-busca
  const parent = new Map(tracks.map((t) => [t.id, t.id]));
  const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const groupBy = <K>(key: (t: SongTrack) => K | null) => {
    const m = new Map<K, SongTrack[]>();
    for (const t of tracks) { const k = key(t); if (k !== null) (m.get(k) ?? m.set(k, []).get(k)!).push(t); }
    return m;
  };

  // 1. mesmo arquivo
  for (const g of groupBy((t) => t.md5).values()) for (const t of g.slice(1)) union(t.id, g[0].id);
  // 2. mesmo título + versão + cantor
  for (const g of groupBy((t) => { const i = ident.get(t.id)!; return i.artist && i.title ? `${i.title}|${i.version}|${i.artist}` : null; }).values())
    for (const t of g.slice(1)) union(t.id, g[0].id);
  // 3. sem cantor: só com cantor único para o título e duração/tamanho compatíveis
  const byTitle = new Map<string, Map<string, SongTrack[]>>();
  for (const t of tracks) {
    const i = ident.get(t.id)!;
    if (!i.artist || !i.title) continue;
    const k = `${i.title}|${i.version}`;
    const m = byTitle.get(k) ?? byTitle.set(k, new Map()).get(k)!;
    (m.get(i.artist) ?? m.set(i.artist, []).get(i.artist)!).push(t);
  }
  const compatible = (a: SongTrack, b: SongTrack) =>
    a.dur && b.dur ? Math.abs(a.dur - b.dur) <= 3 : Math.abs(a.size - b.size) / Math.max(a.size, b.size) <= 0.12;
  for (const t of tracks) {
    const i = ident.get(t.id)!;
    if (i.artist || !i.title) continue;
    const artists = byTitle.get(`${i.title}|${i.version}`);
    if (!artists || artists.size !== 1) continue;
    const match = [...artists.values()][0].find((x) => compatible(x, t));
    if (match) union(t.id, match.id);
  }

  // grupos → songId estável (md5 da melhor cópia) e canônico
  const groups = new Map<string, SongTrack[]>();
  for (const t of tracks) (groups.get(find(t.id)) ?? groups.set(find(t.id), []).get(find(t.id))!).push(t);
  const songOf = new Map<string, string>();
  const canonical = new Map<string, string>();
  for (const g of groups.values()) {
    const best = bestCopy(g);
    const songId = `s${best.md5.slice(0, 12)}`;
    canonical.set(songId, best.id);
    for (const t of g) songOf.set(t.id, songId);
  }
  return { songOf, canonical, artistFound };
}
