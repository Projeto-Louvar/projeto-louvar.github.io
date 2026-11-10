import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export interface ZipEntry { name: string; url: string }

// Baixa as faixas uma de cada vez (nunca em paralelo) e grava um zip sem compressão.
export async function buildZip(entries: ZipEntry[], dest: string): Promise<void> {
  const out = createWriteStream(dest);
  const zip = archiver('zip', { store: true });
  const closed = new Promise<void>((resolve, reject) => {
    out.on('close', () => resolve());
    out.on('error', reject);
    zip.on('error', reject);
  });
  zip.pipe(out);
  for (const e of entries) {
    const res = await fetch(e.url);
    if (!res.ok || !res.body) throw new Error(`baixar para zip ${e.url}: HTTP ${res.status}`);
    await new Promise<void>((resolve) => {
      zip.once('entry', () => resolve());
      zip.append(Readable.fromWeb(res.body as unknown as WebReadableStream), { name: e.name });
    });
  }
  await zip.finalize();
  await closed;
}
