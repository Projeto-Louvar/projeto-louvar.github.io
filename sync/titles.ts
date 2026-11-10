const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.ogg', '.opus'];

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
