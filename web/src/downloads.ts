export type Platform = 'ios' | 'android' | 'desktop';
export type CollectionDownloadMode = 'zip' | 'sequential' | 'none';

export function detectPlatform(ua: string, maxTouchPoints: number): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function collectionDownloadMode(p: Platform, hasZip: boolean): CollectionDownloadMode {
  if (p === 'ios') return 'none';
  if (p === 'android') return 'sequential';
  return hasZip ? 'zip' : 'sequential';
}

function clickDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function downloadSequential(
  urls: string[],
  onProgress: (done: number, total: number) => void,
  opts: { delayMs?: number; click?: (url: string) => void; wait?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const { delayMs = 1500, click = clickDownload, wait = sleep } = opts;
  for (let i = 0; i < urls.length; i++) {
    onProgress(i, urls.length);
    if (i > 0) await wait(delayMs);
    click(urls[i]);
  }
  onProgress(urls.length, urls.length);
}
