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

export function parseTrackName(fileName: string): { title: string; artist: string } {
  let s = fileName.replace(/\.[^.]+$/, '');
  s = s.replace(/\s+_\s+/g, ' / ').replace(/_/g, ' ');
  s = s.replace(/^\s*\d{1,3}\s*[-.)]\s*/, '');
  s = s.replace(/\s+/g, ' ').trim();
  const i = s.indexOf(' - ');
  if (i > 0) {
    const title = s.slice(i + 3).trim();
    if (title) return { artist: s.slice(0, i).trim(), title };
  }
  return { artist: '', title: s };
}
