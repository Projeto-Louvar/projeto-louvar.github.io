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

import { parseOne } from './cleanTitles';

/** Nome de um arquivo isolado (sem contexto de pasta). O sync usa titlesFor, que vê a pasta inteira. */
export function parseTrackName(fileName: string): { title: string; artist: string } {
  return parseOne(fileName);
}
