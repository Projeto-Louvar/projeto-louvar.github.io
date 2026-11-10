import type { Track } from '../../shared/catalog';

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function searchTracks(tracks: Track[], query: string, limit = 200): Track[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (seen.has(t.md5)) continue;
    const hay = normalize(`${t.title} ${t.artist} ${t.fileName}`);
    if (words.every((w) => hay.includes(w))) {
      seen.add(t.md5);
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}
