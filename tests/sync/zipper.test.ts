import http from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildZip } from '../../sync/zipper';

let server: http.Server;
let base: string;
let dir: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/a') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      res.end('AAAA-bytes-da-faixa-a');
    } else if (req.url === '/b') {
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      res.end('BBBB-bytes-da-faixa-b');
    } else if (req.url === '/missing') {
      res.writeHead(404);
      res.end('nao existe');
    } else if (req.url === '/reset') {
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': '100000' });
      res.write('inicio truncado');
      setTimeout(() => res.socket?.destroy(), 30);
    } else {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'zipper-test-'));
});

describe('buildZip', () => {
  it('grava um zip com todas as entradas', async () => {
    const dest = join(dir, 'out.zip');
    await buildZip(
      [
        { name: 'a.mp3', url: `${base}/a` },
        { name: 'b.mp3', url: `${base}/b` },
      ],
      dest,
    );
    const bytes = readFileSync(dest);
    expect(bytes.includes(Buffer.from('a.mp3'))).toBe(true);
    expect(bytes.includes(Buffer.from('b.mp3'))).toBe(true);
    expect(bytes.includes(Buffer.from('AAAA-bytes-da-faixa-a'))).toBe(true);
    expect(readdirSync(dir)).toEqual(['out.zip']);
  });

  it('rejeita com HTTP 404 e não deixa zip nem temporários', async () => {
    const dest = join(dir, 'out.zip');
    await expect(
      buildZip(
        [
          { name: 'a.mp3', url: `${base}/a` },
          { name: 'x.mp3', url: `${base}/missing` },
        ],
        dest,
      ),
    ).rejects.toThrow(/HTTP 404/);
    expect(existsSync(dest)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('rejeita quando a conexão cai no meio do corpo, sem travar nem derrubar o processo', async () => {
    const dest = join(dir, 'out.zip');
    await expect(
      buildZip([{ name: 'r.mp3', url: `${base}/reset` }], dest),
    ).rejects.toThrow();
    expect(existsSync(dest)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  }, 10_000);
});
