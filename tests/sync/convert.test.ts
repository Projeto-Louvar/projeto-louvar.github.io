import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { extractAudio } from '../../sync/convert';
import { audioNameFor, isAudioFile, isVideoFile } from '../../sync/titles';

const hasFfmpeg = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']).status === 0;
const dir = mkdtempSync(join(tmpdir(), 'conv-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('vídeos', () => {
  it('reconhece vídeo e dá nome de áudio', () => {
    expect(isVideoFile('Louvor.MP4')).toBe(true);
    expect(isAudioFile('Louvor.mp4')).toBe(false);
    expect(audioNameFor('Louvor (Ao Vivo).mp4')).toBe('Louvor (Ao Vivo).m4a');
  });

  it.skipIf(!hasFfmpeg)('extrai só o áudio de um .mp4', async () => {
    const mp4 = join(dir, 'v.mp4');
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-c:a', 'aac', '-shortest', mp4]);
    const out = join(dir, 'v.m4a');
    await extractAudio(mp4, out);
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeLessThan(statSync(mp4).size);
    const probe = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-i', out]).stderr.toString();
    expect(probe).toMatch(/Audio: aac/);
    expect(probe).not.toMatch(/Video:/);
  });
});
