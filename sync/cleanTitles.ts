// Transforma nomes de arquivo bagunçados em "nome da música" + "cantor".
// Trabalha em três níveis:
//   1. o arquivo: "+" e hífens viram espaço, tira numeração, "[1]", "(Clipe Oficial)"...;
//   2. a pasta: o que se repete no começo/fim de todos os arquivos (artista, álbum, "Playback Gospel") sai do título;
//   3. o acervo: cantores que aparecem em muitos arquivos indicam qual pedaço é o cantor quando a ordem vem trocada.
// Casos que nenhuma regra resolve vão em scripts/title-overrides.json (id do arquivo no Drive → título/cantor).

export interface NamedFile { id: string; name: string; folderId: string }
export interface TitleArtist { title: string; artist: string }
export type TitleOverrides = Record<string, Partial<TitleArtist>>;

const NOISE = /\s*[\[(][^\[\]()]*\b(?:clipe|videoclipe|videoclip|v[ií]deo|video|lyric|lyrics|oficial|official|4k|hd)\b[^\[\]()]*[\])]/giu;
const BRACKET = /\s*\[(?![^\]]*remix)[^\]]*\]/giu; // [Sony Music Live], [Kemuel Nation]...
const LIVE_PAREN = /\((?:ao vivo|live)\b[^()]*\)/giu; // (Ao Vivo no Sintonize) → (Ao Vivo)
const TAG = /^(?:ao vivo|live|ac[uú]stico|acoustic|play ?back(?: gospel)?|instrumental|remix|vers[aã]o\b.*|live session|ministra[cç][aã]o ao vivo|cover)$/iu;
// Partes que não são nem título nem cantor: álbum, ano, crédito de playback, "Ao Vivo Fulano..." (nome de álbum)
const JUNK = /^(?:(?:cd|lp|dvd|ep|[aá]lbum|album|lyrics?|v[ií]deo|clipe)\b.*|\d{4}|(?:ao vivo|ac[uú]stico|live)\s.+)$/iu;
// Tira-me, Liberta-Me de Mim, Aproxime-Se: hífen que não separa (pronome seguido de minúscula ou fim)
const isPronoun = (x: string) => /^(?:me|te|se|nos|vos|lhe|lhes|lo|la|los|las)(?=[\s,.!?]|$)/i.test(x) && (/^\S+\s+\p{Ll}/u.test(x) || /^\S+[\s,.!?]*$/u.test(x));
const CREDIT = /^por\s+\S+(?:\s+\S+)?$/iu; // \"Por Jô Santos\" no fim de playbacks
const ALBUM_PAREN = /\s*\((?:cd|lp|dvd|ep|[aá]lbum|album)\b[^()]*\)/giu;
const SMALL = new Set(['a', 'o', 'as', 'os', 'e', 'é', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'pra', 'pro', 'com', 'por', 'um', 'uma', 'ao', 'à']);
const ACRONYMS = new Set(['DVD', 'CD', 'MK', 'EP', 'TV', 'II', 'III', 'IV']);

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "ME ATRAIU (AO VIVO)" → "Me Atraiu (Ao Vivo)"; "a boa colheita" → "A boa colheita". */
export function fixCaps(s: string): string {
  const core = s.replace(/\((?:Ao Vivo|Playback|Live)\)/g, '');
  if (/\p{Lu}/u.test(core) && !/\p{Ll}/u.test(core)) {
    s = s.replace(/[\p{L}\p{N}']+/gu, (w, at: number) => {
      const lower = w.toLocaleLowerCase('pt-BR');
      const starts = /(^|[([]|\s[-–]\s)\s*$/.test(s.slice(0, at));
      if (ACRONYMS.has(w) || (w.length <= 3 && !/[AEIOUÁÉÍÓÚÂÊÔÃÕ]/.test(w))) return w; // siglas: DJ, PV, DVD
      return !starts && SMALL.has(lower) ? lower : lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    });
  }
  return s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
}

// Palavras que perderam o acento em nomes como "001+A+eleicao+das+arvores". Só as sem ambiguidade
// (fica de fora "e"/"é", "esta"/"está", "so", "ha"...).
const ACCENTS: Record<string, string> = Object.fromEntries(`
  eleicao:eleição arvores:árvores arvore:árvore joao:João belem:Belém berco:berço ceu:céu ceus:céus gracas:graças
  quao:quão esperanca:esperança refeicao:refeição cancao:canção cancoes:canções coracao:coração oracao:oração
  salvacao:salvação nao:não sao:são mae:mãe maes:mães irmao:irmão irmaos:irmãos maos:mãos voce:você voces:vocês
  ja:já tambem:também alem:além ninguem:ninguém alguem:alguém espirito:Espírito biblia:Bíblia proximo:próximo
  vitoria:vitória gloria:glória historia:história familia:família crianca:criança criancas:crianças pao:pão
  paes:pães coracoes:corações benca:bênção bencao:bênção bencaos:bênçãos licao:lição licoes:lições amanha:amanhã
  manha:manhã musica:música musicas:músicas jesus:Jesus deus:Deus cristo:Cristo maria:Maria jose:José
  arca:arca noe:Noé abraao:Abraão moises:Moisés davi:Davi golias:Golias zaqueu:Zaqueu natal:Natal
  pascoa:Páscoa ressurreicao:ressurreição criacao:criação adoracao:adoração louvai:louvai tres:três
  util:útil facil:fácil dificil:difícil feliz:feliz pequenino:pequenino tambor:tambor estrela:estrela
  anjos:anjos anjo:anjo pastores:pastores magos:magos rei:rei reis:reis paz:paz luz:luz obrigado:obrigado
  dia:dia agua:água aguas:águas animais:animais passaro:pássaro passaros:pássaros sol:sol lua:lua
`.trim().split(/\s+/).map((pair) => pair.split(':') as [string, string]));

function addAccents(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => {
    const to = ACCENTS[w.toLowerCase()];
    if (!to || to.toLowerCase() === w.toLowerCase() && to === to.toLowerCase()) return w;
    // mantém maiúscula inicial do original; nomes próprios do dicionário já vêm com maiúscula
    return /^\p{Lu}/u.test(w) ? to.charAt(0).toUpperCase() + to.slice(1) : to;
  });
}

/** Nível 1: limpeza de um nome de arquivo, ainda sem separar artista e título. */
export function preClean(fileName: string): string {
  let s = fileName.replace(/\.[^.]{2,5}$/, '');
  if (/Ã[\u0080-¿]/.test(s)) { const fixed = Buffer.from(s, 'latin1').toString('utf8'); if (!fixed.includes('�')) s = fixed; } // HistÃ³ria → História
  s = s.replace(/\s*\(\d+\)\s*$/, '');                                             // cópia "(1)" 
  if (!/\s/.test(s) && s.includes('+')) s = addAccents(s.replace(/\+/g, ' '));  // 001+A+boa+colheita (vêm sem acento)
  s = s.replace(/\p{Extended_Pictographic}️?/gu, ' ');                     // emojis
  if (!/\s/.test(s) && /[a-z]-[a-z]/i.test(s)) s = s.replace(/-/g, ' ');        // jaydan-vencere-gospel
  s = s.replace(/_\d+$/, '').replace(/__+/g, '…');                               // cópia "_1"; nome cortado
  s = s.replace(/\s+_\s+/g, ' / ').replace(/(\d)_(\d)/g, '$1:$2').replace(/\b(minh|d|n)_(?=\p{L})/giu, "$1'").replace(/(\p{L})_(\p{Ll}{1,2})\b/gu, "$1'$2")
    .replace(/(\p{L})_\s/gu, '$1. ').replace(/_+$/, '').replace(/_/g, ' ');           // feat_ → feat.; Minh_alma → Minh'alma
  s = s.replace(/\s@\s[^-–]*/, ' ').replace(/[♪]/g, ' ');
  s = s.replace(/\s*\[\d+\]/g, '').replace(/\s*\(\d+\)\s*$/, '');                // cópias: [1], (1)
  s = s.replace(NOISE, '').replace(BRACKET, '').replace(/\s+I\s+Clipe Oficial\s*$/i, '');
  s = s.replace(/\s+(?:videoclip|videoclipe|clipe|v[ií]deo|lyric|lyrics|[aá]udio|oficial|official|4k|hd|coreografia)(?:\s+(?:video|v[ií]deo|oficial|official|4k|hd))*\s*$/iu, '');
  s = s.replace(LIVE_PAREN, '(Ao Vivo)').replace(/^(.*\))\s+[^()]*\b(?:19|20)\d{2}$/u, '$1'); // "(Ao Vivo) Sertanejo Gospel 2015"
  // "Cantor-Título" sem espaços em volta do hífen (mas não "Tira-me", "Sonda-me")
  if (!/\s[-–]\s/.test(s)) {
    const m = s.match(/^(.*?\p{L})-(\p{Lu}.*)$/u);
    if (m && !isPronoun(m[2]) && m[1].includes(' ')) s = `${m[1]} - ${m[2]}`;
  }
  s = s.replace(/\s*[┃│|♫]\s*/g, ` - `);
  s = s.replace(/^\s*\d{1,3}\s*[-.)]\s*/, '').replace(/^\s*\d{2,3}\s+(?=\p{L})/u, ''); // numeração de faixa
  s = s.trim();
  // Espaço duplo/triplo separa partes ("Artista  Título", "Lauriete   Álbum X   Música")
  s = s.replace(/\s*(?:\s{2,}|\s[-–]\s)\s*/g, ' - ').replace(/(?: - )+/g, ' - ');
  return s.replace(/^[-–\s]+|[-–\s]+$/g, '').replace(/\s+/g, ' ').trim();
}

/** Partes separadas por " - " fora de parênteses. */
function segments(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    if (depth === 0 && (s.startsWith(' - ', i) || s.startsWith(' – ', i))) { out.push(cur); cur = ''; i += 2; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Nível 2: tira começo/fim repetidos em todos os arquivos da pasta (≥ 4 arquivos, ≥ 2 palavras). */
export function stripFolderAffixes(names: string[]): { names: string[]; removed: string[] } {
  if (names.length < 4) return { names, removed: [] };
  const toks = names.map((n) => n.split(' '));
  const same = (a: string, b: string) => norm(a) === norm(b) || (!norm(a) && !norm(b) && a === b);
  let pre = 0;
  while (toks.every((t) => t.length > pre + 1 && same(t[pre], toks[0][pre]))) pre++;
  let suf = 0;
  while (toks.every((t) => t.length > pre + suf + 1 && same(t[t.length - 1 - suf], toks[0][toks[0].length - 1 - suf]))) suf++;
  const words = (arr: string[]) => arr.filter((w) => norm(w)).length;
  // o começo só é cortado em fronteira de parte (" - "), nunca no meio do nome da música
  while (pre > 0 && toks[0][pre - 1] !== '-') pre--;
  if (words(toks[0].slice(toks[0].length - suf)) < 2) while (suf > 0 && toks[0][toks[0].length - suf] !== '-') suf--;
  const preWords = toks[0].slice(0, pre), sufWords = toks[0].slice(toks[0].length - suf);
  const usePre = words(preWords) >= 2, useSuf = words(sufWords) >= 2;
  if (!usePre && !useSuf) return { names, removed: [] };
  const cut = toks.map((t) => t.slice(usePre ? pre : 0, useSuf ? t.length - suf : t.length).join(' ')
    .replace(/^[\s\-–·:,]+|[\s\-–·:,]+$/g, ''));
  const removed = [usePre ? preWords.join(' ') : '', useSuf ? sufWords.join(' ') : '']
    .map((x) => x.replace(/^[\s\-–·:,]+|[\s\-–·:,]+$/g, '')).filter(Boolean);
  return { names: cut, removed };
}

const looksLikeArtist = (s: string) => !!s && !/\d|[aá]lbum|playback|\bpor\b/i.test(s) && s.split(' ').length <= 5;

/** Último parêntese balanceado no fim: "A (B (C))" → ["A", "B (C)"]. */
function trailingParen(s: string): [string, string] | null {
  if (!s.endsWith(')')) return null;
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') depth++;
    else if (s[i] === '(' && --depth === 0) return [s.slice(0, i).trim(), s.slice(i + 1, -1).trim()];
  }
  return null;
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function startsWithKnown(s: string, known: Set<string>): boolean {
  const w = norm(s).split(' ');
  for (let len = Math.min(4, w.length - 1); len >= 2; len--) if (known.has(w.slice(0, len).join(' '))) return true;
  return false;
}

/** Posição (em palavras) de um cantor conhecido no meio do título: "Agnus Dei David Quinlan No Infinito..." */
function knownInside(words: string[], known: Set<string>, frequent: Set<string>): [number, number] | null {
  const depthAt: number[] = [];
  let d = 0;
  for (const w of words) { depthAt.push(d); d += (w.match(/[([]/g) ?? []).length - (w.match(/[)\]]/g) ?? []).length; }
  for (let i = 2; i < words.length; i++) {
    if (depthAt[i] > 0 || SMALL.has(norm(words[i])) || isPronoun(words[i])) continue;
    for (let len = 4; len >= 1; len--) {
      if (i + len > words.length) continue;
      const cand = norm(words.slice(i, i + len).join(' ').replace(/,.*$/, ''));
      const after = words.length - (i + len);
      // depois do cantor vem o álbum (após vírgula, lista de cantores) ou o cantor é muito frequente
      const next = words[i + len] ?? '';
      if (cand.length >= 6 && known.has(cand) && !next.startsWith('(') && (after >= 2 || /,/.test(words[i + len - 1] ?? '') || (frequent.has(cand) && i >= 3))) return [i, len];
    }
  }
  return null;
}

/** Separa partes em título e cantor, usando os cantores conhecidos do acervo. */
function pick(segs: string[], known: Set<string>, folderArtist: string, frequent: Set<string>): TitleArtist {
  let tag = '';
  const parts = segs.filter((s, i) => (TAG.test(s) ? ((tag ||= s), false) : !JUNK.test(s) && !(i === segs.length - 1 && segs.length >= 3 && CREDIT.test(s))));
  const isArtist = (s: string) => known.has(norm(s)) ||
    /(?:^|\s)(?:ft\.?|feat\.?)\s|,|&|^(?:dj|minist[eé]rio|banda|grupo|coral|comunidade|pr\.|pastor|padre)\s/iu.test(s);
  let title = '', artist = '';
  const dup = parts.find((p, i) => parts.some((q, j) => j !== i && norm(q) === norm(p)));
  if (parts.length === 1) {
    title = parts[0];
  } else if (segs.length >= 3 && TAG.test(segs[1]) && !TAG.test(segs[0]) && !JUNK.test(segs[0])) {
    // "Muralhas - Ao Vivo - André Valadão - Crer para Ver": música, versão, cantor, álbum
    title = segs[0];
    artist = segs.slice(2).find((x) => !TAG.test(x) && !JUNK.test(x) && norm(x) !== norm(segs[0])) ?? '';
  } else if (dup) {
    title = dup; artist = parts.find((p) => norm(p) !== norm(dup) && isArtist(p)) ?? '';
  } else if (parts.length >= 2) {
    let k = parts.findIndex(isArtist);
    if (k < 0) k = parts.findIndex((p) => startsWithKnown(p, known));
    if (k >= 0) { artist = parts[k]; title = parts.find((_, i) => i !== k)!; }
    else if (parts.length === 2 && /\(/.test(parts[0]) !== /\(/.test(parts[1])) {
      // "Música (Ao Vivo) - Cantor": a parte com parênteses é a música
      [title, artist] = /\(/.test(parts[0]) ? parts : [parts[1], parts[0]];
    } else if (parts.length === 2 && wordCount(parts[0]) >= 4 && wordCount(parts[0]) >= 2 * wordCount(parts[1])) {
      // "Thats How You Change The World - Newsboys": o lado bem mais longo é a música
      [title, artist] = parts;
    } else { artist = parts[0]; title = parts[parts.length - 1]; }
  }
  title = title.replace(ALBUM_PAREN, '').trim();
  // "Jesus Kemuel (Jesus)": o parêntese final repete o começo → é o título; o meio é o cantor
  const tp = trailingParen(title);
  if (tp && norm(tp[0]).startsWith(norm(tp[1])) && norm(tp[0]) !== norm(tp[1])) {
    if (!artist) artist = tp[0].slice(tp[1].length).trim();
    title = tp[1];
  }
  // "Doce Amor Ton Carfi,Jefferson Moraes Doce Amor": título repetido no começo e no fim, cantor no meio
  {
    const w = title.split(/\s+/);
    for (let len = Math.floor(w.length / 2); len >= 1; len--) {
      const middle = w.slice(len, w.length - len);
      // o meio precisa ter cara de cantor (2+ palavras com maiúscula): "Dia Após Dia" não é "título cantor título"
      const looksLikeNames = middle.length >= 2 && middle.every((x) => /^[\p{Lu}\d]/u.test(x) || /,/.test(x) || SMALL.has(x.toLowerCase()));
      if (looksLikeNames && norm(w.slice(0, len).join(' ')) === norm(w.slice(w.length - len).join(' '))) {
        if (!artist) artist = w.slice(len, w.length - len).join(' ');
        title = w.slice(0, len).join(' ');
        break;
      }
    }
  }
  // "Grandes Coisas Fernandinho,Paula T. Santos Uma Nova História": título + cantores + álbum (downloads do Spotify)
  if (!artist) {
    const words = title.split(/\s+/);
    const at = knownInside(words, known, frequent);
    if (at) {
      const [i, len] = at;
      artist = words.slice(i, i + len).join(' ').replace(/,.*$/, ''); // "Fernandinho,Paula T. Santos" → Fernandinho
      title = words.slice(0, i).join(' ');
    }
  }
  // parêntese que só repete o cantor: "Ninguém Explica Deus (Preto no Branco)"
  if (artist) title = title.replace(/\s*\(([^()]+)\)/g, (m, inner) => (norm(inner) === norm(artist) ? '' : m));
  if (!artist && folderArtist) artist = folderArtist; // cantor repetido em todos os arquivos da pasta
  artist = artist.replace(/^(?:ft\.?|feat\.?)\s+/i, '').replace(/\s*[([][^()[\]]*[)\]]/g, '').trim();
  { const a = artist.split(' '), h = a.length / 2; if (a.length % 2 === 0 && norm(a.slice(0, h).join(' ')) === norm(a.slice(h).join(' '))) artist = a.slice(0, h).join(' '); }
  if (norm(artist) === norm(title) || artist.length < 2) artist = '';
  title = fixCaps(title.trim());
  const label = /play/i.test(tag) ? 'Playback' : tag.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase());
  if (tag && !norm(title).includes(norm(tag))) title = `${title} (${label})`;
  return { title: title.replace(/\(\s*play ?back\s*\)/i, '(Playback)'), artist: fixCaps(artist.trim()) };
}

/** Títulos de todo o acervo de uma vez (precisa ver as pastas e os cantores frequentes). */
export function titlesFor(files: NamedFile[], overrides: TitleOverrides = {}): Map<string, TitleArtist> {
  const byFolder = new Map<string, NamedFile[]>();
  for (const f of files) (byFolder.get(f.folderId) ?? byFolder.set(f.folderId, []).get(f.folderId)!).push(f);

  const cleaned = new Map<string, { segs: string[]; folderArtist: string }>();
  for (const group of byFolder.values()) {
    const pre = group.map((f) => preClean(f.name));
    const { names, removed } = stripFolderAffixes(pre);
    const folderArtist = removed.flatMap((r) => segments(r.replace(/\s*\([^()]*\)\s*$/, ''))).find((x) => looksLikeArtist(x) && !TAG.test(x) && !JUNK.test(x)) ?? '';
    group.forEach((f, i) => cleaned.set(f.id, { segs: segments(names[i] || pre[i]), folderArtist }));
  }

  // Nível 3: cantores conhecidos = primeira parte de "Cantor - Música" em 3 ou mais arquivos
  const count = new Map<string, number>();
  for (const { segs } of cleaned.values()) {
    // "Tocou-Me - Ao Vivo" não faz de "Tocou-Me" um cantor
    if (segs.length === 2 && looksLikeArtist(segs[0]) && !TAG.test(segs[1]) && !JUNK.test(segs[1])) count.set(norm(segs[0]), (count.get(norm(segs[0])) ?? 0) + 1);
  }
  const known = new Set([...count].filter(([k, n]) => n >= 3 && k.length >= 3).map(([k]) => k));
  const frequent = new Set([...count].filter(([, n]) => n >= 8).map(([k]) => k));

  const out = new Map<string, TitleArtist>();
  for (const f of files) {
    const c = cleaned.get(f.id)!;
    const ta = pick(c.segs, known, c.folderArtist, frequent);
    const ov = overrides[f.id];
    out.set(f.id, { title: ov?.title ?? (ta.title || preClean(f.name)), artist: ov?.artist ?? ta.artist });
  }
  return out;
}

/** Um arquivo sozinho (sem contexto de pasta). */
export function parseOne(fileName: string): TitleArtist {
  return titlesFor([{ id: 'x', name: fileName, folderId: 'x' }]).get('x')!;
}

