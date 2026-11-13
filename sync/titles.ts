const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.ogg', '.opus'];
// Vídeos: o sync extrai só o áudio (.m4a) antes de publicar
const VIDEO_EXT = ['.mp4', '.m4v', '.mov'];

export function isVideoFile(name: string): boolean {
  const n = name.toLowerCase();
  return VIDEO_EXT.some((ext) => n.endsWith(ext));
}

/** Nome do arquivo de áudio gerado a partir de um vídeo ("Louvor.mp4" → "Louvor.m4a"). */
export function audioNameFor(name: string): string {
  return name.replace(/\.[^.]+$/, '') + '.m4a';
}

export function isAudioFile(name: string): boolean {
  const n = name.toLowerCase();
  return AUDIO_EXT.some((ext) => n.endsWith(ext));
}

// Etiquetas de vídeo que não fazem parte do nome da música
const NOISE = /\s*[\[(]\s*(?:clipe oficial|v[ií]deo oficial|official (?:music )?video|v[ií]deo (?:com )?letra|lyric video|clipe)[^\])]*[\])]/giu;
const SMALL = new Set(['a', 'o', 'as', 'os', 'e', 'é', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'pra', 'pro', 'com', 'por', 'um', 'uma', 'ao', 'à']);
const ACRONYMS = new Set(['DVD', 'CD', 'MK', 'EP', 'TV', 'II', 'III', 'IV']);

/** " - " fora de parênteses (para não cortar "(LIVE SESSION - AO VIVO)"). */
function topLevelDash(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if (depth === 0 && s.startsWith(' - ', i)) return i;
  }
  return -1;
}

/** "ME ATRAIU (AO VIVO)" → "Me Atraiu (Ao Vivo)". Só mexe em textos inteiramente em maiúsculas. */
function fixCaps(s: string): string {
  if (!/\p{Lu}/u.test(s) || /\p{Ll}/u.test(s)) return s;
  return s.replace(/[\p{L}\p{N}']+/gu, (w, at: number) => {
    const lower = w.toLocaleLowerCase('pt-BR');
    // início do texto, depois de "(" / "[" ou de " - ": sempre maiúscula
    const starts = /(^|[([]|\s[-–]\s)\s*$/.test(s.slice(0, at));
    return ACRONYMS.has(w) || (w.length <= 3 && !/[AEIOUÁÉÍÓÚÂÊÔÃÕ]/.test(w)) ? w // siglas sem vogal: DJ, PV, DVD
      : !starts && SMALL.has(lower) ? lower
      : lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
  });
}

export function parseTrackName(fileName: string): { title: string; artist: string } {
  let s = fileName.replace(/\.[^.]+$/, '');
  s = s.replace(/\s+_\s+/g, ' / ').replace(/_/g, ' ');
  s = s.replace(/\s*\[\d+\]/g, ''); // "[1]" de cópias baixadas duas vezes
  s = s.replace(NOISE, '').replace(/\s+I\s+Clipe Oficial\s*$/i, ''); // "[Clipe Oficial]", "(Clipe Oficial MK Music)"...
  s = s.replace(/\s*[┃│|]\s*/g, ' - ');
  s = s.replace(/^\s*\d{1,3}\s*[-.)]\s*/, '').trim();
  // Vídeos do YouTube perdem o "|" e ficam "Artista  Título": sem traço, o espaço duplo vira travessão
  if (topLevelDash(s.replace(/\s+/g, ' ')) < 0) s = s.replace(/\s{2,}/g, ' – ');
  s = s.replace(/\s+/g, ' ').trim();
  const i = topLevelDash(s);
  if (i > 0) {
    const title = s.slice(i + 3).trim();
    if (title) return { artist: fixCaps(s.slice(0, i).trim()), title: fixCaps(title) };
  }
  return { artist: '', title: fixCaps(s) };
}
