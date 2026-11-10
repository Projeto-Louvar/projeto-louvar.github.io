import { describe, expect, it } from 'vitest';
import { buildTree, type DriveSnapshot } from '../../sync/tree';
import { finalizeCatalog, orphanUrls, planSync, PALETTE, zipKeyFor } from '../../sync/plan';

const BASE = 'https://github.com/dono/louvores';
const NOW = '2026-11-10T06:00:00.000Z';

function snapshot(files: DriveSnapshot['files']): DriveSnapshot {
  return {
    rootId: 'R',
    folders: [
      { id: 'R', name: 'Louvores', parentId: null },
      { id: 'A', name: 'Antigas', parentId: 'R' },
      { id: 'B', name: 'Bônus', parentId: 'R' },
    ],
    files,
  };
}

const f1 = { id: 'f1', name: '01 - Cassiane - Hino.mp3', parentId: 'A', md5: 'aaa', size: 10 };
const f2 = { id: 'f2', name: '02 - Hino.mp3', parentId: 'A', md5: 'bbb', size: 20 };
const f3 = { id: 'f3', name: 'Copia.mp3', parentId: 'B', md5: 'aaa', size: 10 };

describe('planSync — primeira execução', () => {
  const snap = snapshot([f1, f2, f3]);
  const plan = planSync(snap, buildTree(snap), null, BASE, NOW);

  it('envia cada md5 uma única vez', () => {
    expect(plan.uploads.map((u) => u.fileId)).toEqual(['f1', 'f2']);
    expect(plan.uploads[0]).toEqual({
      fileId: 'f1',
      fileName: '01 - Cassiane - Hino.mp3',
      tag: 'c-A',
      assetName: '01-cassiane-hino.mp3',
      url: `${BASE}/releases/download/c-A/01-cassiane-hino.mp3`,
      size: 10,
    });
  });
  it('faixa duplicada reaproveita a URL', () => {
    const t3 = plan.catalog.tracks.find((t) => t.id === 'f3')!;
    expect(t3.url).toBe(plan.uploads[0].url);
  });
  it('preenche faixas com título, artista e coleção', () => {
    expect(plan.catalog.tracks.find((t) => t.id === 'f1')).toMatchObject({
      title: 'Hino', artist: 'Cassiane', collectionId: 'A', fileName: '01 - Cassiane - Hino.mp3', md5: 'aaa', size: 10,
    });
  });
  it('gera coleções com cor da paleta e zip pendente', () => {
    expect(plan.catalog.rootId).toBe('R');
    expect(plan.catalog.generatedAt).toBe(NOW);
    expect(plan.catalog.collections.map((c) => [c.id, c.color])).toEqual([['R', PALETTE[0]], ['A', PALETTE[1]], ['B', PALETTE[2]]]);
    expect(plan.zips.map((z) => [z.collectionId, z.baseName, z.tag])).toEqual([['A', 'antigas', 'c-A'], ['B', 'bonus', 'c-B']]);
    expect(plan.catalog.collections.find((c) => c.id === 'A')!.zipUrls).toEqual([]);
  });
});

describe('planSync — execução seguinte', () => {
  const snap1 = snapshot([f1, f2]);
  const first = planSync(snap1, buildTree(snap1), null, BASE, NOW);
  const prev = structuredClone(first.catalog);
  const colA = prev.collections.find((c) => c.id === 'A')!;
  colA.zipUrls = [`${BASE}/releases/download/c-A/antigas.zip`];
  colA.zipKey = zipKeyFor(['aaa', 'bbb']);

  it('nada mudou → nenhum envio e nenhum zip', () => {
    const plan = planSync(snap1, buildTree(snap1), prev, BASE, NOW);
    expect(plan.uploads).toEqual([]);
    expect(plan.zips).toEqual([]);
    expect(plan.catalog.collections.find((c) => c.id === 'A')!.zipUrls).toEqual(colA.zipUrls);
  });
  it('arquivo alterado recebe nome novo e o zip é refeito', () => {
    const snap2 = snapshot([{ ...f1, md5: 'ccc' }, f2]);
    const plan = planSync(snap2, buildTree(snap2), prev, BASE, NOW);
    expect(plan.uploads.map((u) => u.assetName)).toEqual(['01-cassiane-hino-2.mp3']);
    expect(plan.zips.map((z) => z.collectionId)).toEqual(['A']);
    // até o zip novo ficar pronto, o antigo continua no catálogo
    expect(plan.catalog.collections.find((c) => c.id === 'A')!.zipUrls).toEqual(colA.zipUrls);
  });
});

describe('finalizeCatalog', () => {
  const snap = snapshot([f1, f2, { ...f3, md5: 'zzz' }]);
  const plan = planSync(snap, buildTree(snap), null, BASE, NOW);

  it('remove faixas não enviadas e coleções que ficaram vazias', () => {
    const notReady = new Set([plan.uploads.find((u) => u.fileId === 'f3')!.url]);
    const cat = finalizeCatalog(plan.catalog, notReady);
    expect(cat.tracks.map((t) => t.id)).toEqual(['f1', 'f2']);
    expect(cat.collections.map((c) => c.id)).toEqual(['R', 'A']);
    expect(cat.collections.find((c) => c.id === 'R')!.childIds).toEqual(['A']);
  });
  it('sem pendências, mantém tudo', () => {
    const cat = finalizeCatalog(plan.catalog, new Set());
    expect(cat.tracks).toHaveLength(3);
    expect(cat.collections).toHaveLength(3);
  });
});

describe('orphanUrls', () => {
  it('lista URLs de faixas e zips que não são mais usadas', () => {
    const snap = snapshot([f1, f2]);
    const prev = planSync(snap, buildTree(snap), null, BASE, NOW).catalog;
    prev.collections.find((c) => c.id === 'A')!.zipUrls = [`${BASE}/z.zip`];
    const next = structuredClone(prev);
    next.tracks = next.tracks.filter((t) => t.id !== 'f2');
    next.collections.find((c) => c.id === 'A')!.zipUrls = [];
    expect(orphanUrls(prev, next).sort()).toEqual([`${BASE}/releases/download/c-A/02-hino.mp3`, `${BASE}/z.zip`].sort());
  });
  it('sem catálogo anterior não há órfãos', () => {
    const snap = snapshot([f1]);
    expect(orphanUrls(null, planSync(snap, buildTree(snap), null, BASE, NOW).catalog)).toEqual([]);
  });
});

describe('finalizeCatalog — com catálogo anterior', () => {
  const snap1 = snapshot([f1, f2]);
  const prev = planSync(snap1, buildTree(snap1), null, BASE, NOW).catalog;

  it('arquivo modificado sem upload pronto mantém a faixa antiga', () => {
    const snap2 = snapshot([{ ...f1, md5: 'ccc' }, f2]);
    const plan = planSync(snap2, buildTree(snap2), prev, BASE, NOW);
    const notReady = new Set(plan.uploads.map((u) => u.url));
    const cat = finalizeCatalog(plan.catalog, notReady, prev);
    const t1 = cat.tracks.find((t) => t.id === 'f1')!;
    expect(t1.url).toBe(prev.tracks.find((t) => t.id === 'f1')!.url);
    expect(t1.md5).toBe('aaa');
    expect(cat.collections.find((c) => c.id === 'A')!.trackIds).toContain('f1');
    expect(orphanUrls(prev, cat)).not.toContain(t1.url);
  });
  it('arquivo novo não pronto continua descartado', () => {
    const snap2 = snapshot([f1, f2, { ...f3, md5: 'zzz' }]);
    const plan = planSync(snap2, buildTree(snap2), prev, BASE, NOW);
    const notReady = new Set(plan.uploads.map((u) => u.url));
    const cat = finalizeCatalog(plan.catalog, notReady, prev);
    expect(cat.tracks.map((t) => t.id)).toEqual(['f1', 'f2']);
    expect(cat.collections.map((c) => c.id)).toEqual(['R', 'A']);
  });
  it('poda aninhada em mais de um nível, mantendo a raiz', () => {
    const snap: DriveSnapshot = {
      rootId: 'R',
      folders: [
        { id: 'R', name: 'Louvores', parentId: null },
        { id: 'A', name: 'Antigas', parentId: 'R' },
        { id: 'B', name: 'Bônus', parentId: 'R' },
        { id: 'C', name: 'Fundo', parentId: 'B' },
      ],
      files: [f1, { id: 'f4', name: 'Deep.mp3', parentId: 'C', md5: 'ddd', size: 5 }],
    };
    const plan = planSync(snap, buildTree(snap), null, BASE, NOW);
    const notReady = new Set([plan.uploads.find((u) => u.fileId === 'f4')!.url]);
    const cat = finalizeCatalog(plan.catalog, notReady, null);
    expect(cat.collections.map((c) => c.id)).toEqual(['R', 'A']);
    expect(cat.collections.find((c) => c.id === 'R')!.childIds).toEqual(['A']);
  });
});
