import { describe, expect, it } from 'vitest';
import type { Catalog } from '../../shared/catalog';
import { buildTree, type DriveSnapshot } from '../../sync/tree';
import { finalizeCatalog, orphanUrls, planSync, PALETTE, zipKeyFor, zipReady, deletableNow, nextPendingDeletes, massDeletionBlocked, keepGeneratedAt, tagFor } from '../../sync/plan';

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

describe('zipReady', () => {
  const snap = snapshot([f1, f2, f3]);
  const planned = planSync(snap, buildTree(snap), null, BASE, NOW).catalog;

  it('true quando todas as faixas têm a url planejada', () => {
    expect(zipReady('A', finalizeCatalog(planned, new Set()), planned)).toBe(true);
  });

  it('false quando uma faixa voltou para a url anterior', () => {
    const fin = finalizeCatalog(planned, new Set());
    const stale = { ...fin, tracks: fin.tracks.map((t) => (t.id === 'f2' ? { ...t, url: `${BASE}/releases/download/c-A/velho.mp3` } : t)) };
    expect(zipReady('A', stale, planned)).toBe(false);
  });

  it('false quando faltam faixas em relação ao planejado', () => {
    const fin = finalizeCatalog(planned, new Set([planned.tracks.find((t) => t.id === 'f2')!.url]));
    expect(zipReady('A', fin, planned)).toBe(false);
  });

  it('false para coleção sem faixas', () => {
    expect(zipReady('R', finalizeCatalog(planned, new Set()), planned)).toBe(false);
  });
});

describe('exclusão adiada', () => {
  const snap = snapshot([f1, f2, f3]);
  const base = planSync(snap, buildTree(snap), null, BASE, NOW).catalog;
  const u = (n: string) => `${BASE}/releases/download/c-A/${n}`;
  const withPending = (pendingDeletes: string[]): Catalog => ({ ...base, pendingDeletes });
  const used = base.tracks[0].url;

  it('deletableNow: pendentes anteriores que o novo catálogo não referencia', () => {
    expect(deletableNow(withPending([u('x.mp3'), used]), base)).toEqual([u('x.mp3')]);
    expect(deletableNow(null, base)).toEqual([]);
  });

  it('nextPendingDeletes: órfãos + extras + pendentes não apagados, sem duplicar nem referenciados', () => {
    const prev: Catalog = { ...base, tracks: [...base.tracks, { ...base.tracks[0], id: 'z', url: u('orf.mp3') }], pendingDeletes: [u('p1.mp3'), u('p2.mp3'), used] };
    const r = nextPendingDeletes(prev, base, [u('zip.zip'), u('p1.mp3')], [u('p2.mp3')]);
    expect(r.sort()).toEqual([u('orf.mp3'), u('p1.mp3'), u('zip.zip')].sort());
  });

  it('massDeletionBlocked: >20 e >30% das urls do catálogo anterior', () => {
    expect(massDeletionBlocked(2, base)).toBe(false);
    const big: Catalog = { ...base, tracks: Array.from({ length: 100 }, (_, i) => ({ ...base.tracks[0], id: `t${i}`, url: u(`${i}.mp3`) })) };
    expect(massDeletionBlocked(21, big)).toBe(false);
    expect(massDeletionBlocked(31, big)).toBe(true);
    expect(massDeletionBlocked(25, null)).toBe(true);
    expect(massDeletionBlocked(20, null)).toBe(false);
  });
});

describe('keepGeneratedAt', () => {
  const DAY = 86_400_000;
  const base: Catalog = { generatedAt: '2026-11-01T00:00:00.000Z', rootId: 'R', collections: [], tracks: [] };
  const now = Date.parse(base.generatedAt) + 5 * DAY;
  it('inalterado e recente: mantém', () => {
    expect(keepGeneratedAt(base, { ...base, generatedAt: 'x' }, now)).toBe(true);
  });
  it('inalterado e com mais de 30 dias: renova', () => {
    expect(keepGeneratedAt(base, { ...base, generatedAt: 'x' }, Date.parse(base.generatedAt) + 31 * DAY)).toBe(false);
  });
  it('alterado: renova', () => {
    expect(keepGeneratedAt(base, { ...base, rootId: 'Z' }, now)).toBe(false);
  });
  it('sem anterior: renova', () => {
    expect(keepGeneratedAt(null, base, now)).toBe(false);
  });
});

describe('planSync — nomes pendentes de exclusão', () => {
  it('não reaproveita nome de asset pendente de exclusão', () => {
    const snap = snapshot([f1]);
    const prev: Catalog = {
      generatedAt: NOW, rootId: 'R', collections: [], tracks: [],
      pendingDeletes: [`${BASE}/releases/download/c-A/01-cassiane-hino.mp3`],
    };
    const plan = planSync(snap, buildTree(snap), prev, BASE, NOW);
    expect(plan.uploads[0].assetName).toBe('01-cassiane-hino-2.mp3');
  });
});

describe('tagFor', () => {
  it('mantém o formato c-<id> para ids aceitos pelo GitHub', () => {
    expect(tagFor('abc123')).toBe('c-abc123');
    expect(tagFor('16ttS8fviXxRkOWVZKH3wTq_C8M5M7dH_')).toBe('c-16ttS8fviXxRkOWVZKH3wTq_C8M5M7dH_');
  });
  it('não gera tag terminada em "-" (o GitHub recusa com HTTP 422)', () => {
    const tag = tagFor('1MUSDtlpOW9jCGnFz-Y3c1lYwD3Df9Qh-');
    expect(tag.endsWith('-')).toBe(false);
    expect(tag).not.toBe(tagFor('1MUSDtlpOW9jCGnFz-Y3c1lYwD3Df9Qh'));
  });
});

describe('planSync — vídeos viram áudio', () => {
  const v = { id: 'v1', name: 'Lançamento Novo.mp4', parentId: 'A', md5: 'abcdef1234567890', size: 5000, convert: true };
  const snap = snapshot([v]);
  const plan = planSync(snap, buildTree(snap), null, BASE, NOW);

  it('envia como .m4a com marca do conteúdo no nome', () => {
    expect(plan.uploads[0]).toMatchObject({ fileId: 'v1', convert: true, assetName: 'lancamento-novo-abcdef12.m4a' });
    const t = plan.catalog.tracks[0];
    expect(t.fileName).toBe('Lançamento Novo.m4a');
    expect(t.title).toBe('Lançamento Novo');
    expect(t.url.endsWith('.m4a')).toBe(true);
  });

  it('na próxima execução reaproveita o tamanho real do áudio, não o do vídeo', () => {
    const prev = finalizeCatalog(plan.catalog, new Set(), null);
    prev.tracks[0].size = 900; // tamanho do .m4a gravado após a conversão
    const again = planSync(snap, buildTree(snap), prev, BASE, NOW);
    expect(again.uploads).toEqual([]);
    expect(again.catalog.tracks[0].size).toBe(900);
  });
});
