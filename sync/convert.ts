// Vídeos (.mp4 etc.) do Drive viram só áudio (.m4a) antes de ir para o site: tocam em qualquer
// celular e ficam bem menores. Primeiro tenta copiar o áudio sem mexer (rápido, sem perda);
// se o formato não permitir, recodifica em AAC.
import { spawn } from 'node:child_process';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += String(d); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}: ${err.slice(-300)}`))));
  });
}

export async function extractAudio(src: string, dest: string): Promise<void> {
  try {
    await run(['-y', '-i', src, '-vn', '-map', '0:a:0', '-c:a', 'copy', '-movflags', '+faststart', dest]);
  } catch {
    await run(['-y', '-i', src, '-vn', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dest]);
  }
}
