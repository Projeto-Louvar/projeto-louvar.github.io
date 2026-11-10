import archiver from 'archiver';
import { createWriteStream, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export interface ZipEntry { name: string; url: string }

// Baixa as faixas uma de cada vez (nunca em paralelo) e grava um zip sem compressão.
// Cada faixa passa por um arquivo temporário ao lado de dest: erros de rede chegam
// como rejeição do pipeline (e não como 'error' sem ouvinte dentro do archiver).
// Em qualquer falha, o zip parcial e os temporários são apagados.
export async function buildZip(entries: ZipEntry[], dest: string): Promise<void> {
  const out = createWriteStream(dest);
  const zip = archiver('zip', { store: true });
  const closed = new Promise<void>((resolve, reject) => {
    out.on('close', () => resolve());
    out.on('error', reject);
    zip.on('error', reject);
  });
  closed.catch(() => {});
  zip.pipe(out);
  const temps: string[] = [];
  try {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const res = await fetch(e.url);
      if (!res.ok || !res.body) throw new Error(`baixar para zip ${e.url}: HTTP ${res.status}`);
      const tmp = `${dest}.part-${i}`;
      temps.push(tmp);
      await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(tmp));
      await new Promise<void>((resolve, reject) => {
        const onEntry = () => {
          zip.off('error', onError);
          resolve();
        };
        const onError = (err: Error) => {
          zip.off('entry', onEntry);
          reject(err);
        };
        zip.once('entry', onEntry);
        zip.once('error', onError);
        zip.file(tmp, { name: e.name });
      });
      rmSync(tmp, { force: true });
    }
    await zip.finalize();
    await closed;
  } catch (err) {
    zip.abort();
    out.destroy();
    rmSync(dest, { force: true });
    for (const t of temps) rmSync(t, { force: true });
    throw err;
  }
}
