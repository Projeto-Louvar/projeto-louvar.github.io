// Busca de músicas com tolerância a erros de digitação, usando a biblioteca MiniSearch.
// - ignora acentos e maiúsculas;
// - cada palavra aceita pequenos erros (letra faltando, sobrando, trocada): 1 erro a partir de 4 letras, 2 a partir de 7 (duas letras trocadas de lugar contam como 2);
// - a última palavra vale pelo começo ("aleg" acha "Alegria"), para quem ainda está digitando;
// - todas as palavras precisam bater; resultados exatos vêm antes dos aproximados.
import MiniSearch from 'minisearch';
import type { Track } from '../../shared/catalog';

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Junta grafias que soam igual em português, para "roxa" achar "Rocha" e "jezus" achar "Jesus".
 * Usado só por dentro da busca (no índice e no que a pessoa digita); os nomes na tela não mudam.
 */
export function soundAlike(word: string): string {
  return word
    .replace(/ph/g, 'f')
    .replace(/[cs]h/g, 'x')            // ch, sh → x
    .replace(/sc(?=[ei])/g, 's')       // nascer → naser
    .replace(/c(?=[ei])/g, 's')        // sacrifício → sacrifisio
    .replace(/(?<=[aeiou])s(?=[aeiou])/g, 'z') // casa/caza: s entre vogais soa z
    .replace(/z/g, 's')                // ... e tudo vira s
    .replace(/qu(?=[ei])/g, 'k').replace(/k/g, 'c')
    .replace(/y/g, 'i')
    .replace(/w/g, 'v')
    .replace(/^h/, '')                 // h inicial é mudo
    .replace(/([a-z])\1+/g, '$1');     // letras dobradas: ss → s, rr → r
}

const tokenize = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter(Boolean);
const processTerm = (t: string) => (t ? soundAlike(t) : null);

/** Quantos erros de digitação aceitar numa palavra, conforme o tamanho dela. */
export function typoAllowance(term: string): number {
  return term.length >= 7 ? 2 : term.length >= 4 ? 1 : 0;
}

let cache: { tracks: Track[]; index: MiniSearch<Track> } | null = null;

function indexFor(tracks: Track[]): MiniSearch<Track> {
  if (cache?.tracks === tracks) return cache.index;
  const index = new MiniSearch<Track>({
    idField: 'id',
    fields: ['title', 'artist', 'fileName'],
    tokenize,
    processTerm,
  });
  index.addAll(tracks);
  cache = { tracks, index };
  return index;
}

export function searchTracks(tracks: Track[], query: string, limit = 200): Track[] {
  const terms = tokenize(query).map(soundAlike).filter(Boolean);
  if (!terms.length) return [];
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const results = indexFor(tracks).search(terms.join(' '), {
    combineWith: 'AND',
    boost: { title: 2, artist: 1.5 },
    fuzzy: (term) => typoAllowance(term),
    processTerm: (t) => t || null, // a consulta já passou por soundAlike
    prefix: (_term, i, all) => i === all.length - 1 && all[i].length >= 3,
    weights: { fuzzy: 0.3, prefix: 0.6 },
  });
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const r of results) {
    const t = byId.get(String(r.id));
    if (!t || seen.has(t.md5)) continue; // o mesmo áudio em duas coleções aparece uma vez só
    seen.add(t.md5);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
