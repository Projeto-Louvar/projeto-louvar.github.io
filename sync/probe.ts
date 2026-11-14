// Mede duração e bitrate de cada arquivo direto no Drive, com ffprobe lendo só o necessário (requisições
// parciais), sem baixar o arquivo inteiro. O resultado fica no catálogo (dur/kbps), então cada arquivo é
// medido uma vez só. Serve para escolher a melhor cópia de uma mesma música.
import { spawn } from 'node:child_process';
import type { Quality } from './plan';

const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export function parseProbe(json: string): Quality | null {
  try {
    const j = JSON.parse(json) as { streams?: { bit_rate?: string; duration?: string }[]; format?: { bit_rate?: string; duration?: string } };
    const st = j.streams?.[0];
    const dur = Number(st?.duration ?? j.format?.duration ?? 0);
    // bitrate do áudio; o do "format" só serve quando não há vídeo junto (mesmo valor num .mp3)
    const kbps = Math.round(Number(st?.bit_rate ?? 0) / 1000) || 0;
    if (!(dur > 0)) return null;
    return { dur: Math.round(dur * 10) / 10, kbps };
  } catch {
    return null;
  }
}

function probeOne(url: string, token: string, timeoutMs = 60_000): Promise<Quality | null> {
  return new Promise((resolve) => {
    const p = spawn(FFPROBE, ['-v', 'error', '-headers', `Authorization: Bearer ${token}\r\n`,
      '-select_streams', 'a:0', '-show_entries', 'stream=bit_rate,duration:format=duration,bit_rate', '-of', 'json', url],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += String(d); });
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', () => { clearTimeout(timer); resolve(null); });
    p.on('close', () => { clearTimeout(timer); resolve(parseProbe(out)); });
  });
}

/**
 * Mede os arquivos ainda sem medição (cache por md5), em paralelo, até o prazo.
 * Falha vira { dur: 0, kbps: 0 } para não tentar de novo a cada ciclo.
 */
export async function probeFiles(
  files: { id: string; md5: string }[],
  cache: Map<string, Quality>,
  getToken: () => Promise<string>,
  deadlineMs: number,
  concurrency = 8,
): Promise<{ measured: number; failed: number; pending: number }> {
  const todo = [...new Map(files.filter((f) => !cache.has(f.md5)).map((f) => [f.md5, f])).values()];
  let next = 0, measured = 0, failed = 0;
  const worker = async () => {
    while (next < todo.length && Date.now() < deadlineMs) {
      const f = todo[next++];
      const token = await getToken();
      const q = await probeOne(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, token);
      if (q) { cache.set(f.md5, q); measured++; } else { cache.set(f.md5, { dur: 0, kbps: 0 }); failed++; }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { measured, failed, pending: todo.length - measured - failed };
}
