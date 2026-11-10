import { describe, expect, it } from 'vitest';
import { buildTree, type DriveSnapshot } from '../../sync/tree';

const snap: DriveSnapshot = {
  rootId: 'R',
  folders: [
    { id: 'R', name: 'Louvores', parentId: null },
    { id: 'A', name: 'Biblioteca', parentId: 'R' },
    { id: 'G', name: 'Gospel', parentId: 'A' },
    { id: 'L', name: 'Louvor', parentId: 'G' },
    { id: 'M', name: 'Medley', parentId: 'A' },
    { id: 'X', name: 'Vazia', parentId: 'A' },
    { id: 'T', name: 'Top', parentId: 'R' },
    { id: 'T2', name: 'Top Hits', parentId: 'T' },
  ],
  files: [
    { id: 'f10', name: '10 - b.mp3', parentId: 'L', md5: 'm10', size: 1 },
    { id: 'f2', name: '2 - a.mp3', parentId: 'L', md5: 'm2', size: 1 },
    { id: 'f4', name: 'x.mp3', parentId: 'M', md5: 'm4', size: 1 },
    { id: 'f3', name: 'y.mp3', parentId: 'T2', md5: 'm3', size: 1 },
  ],
};

describe('buildTree', () => {
  const tree = buildTree(snap);
  const byId = new Map(tree.map((c) => [c.id, c]));

  it('lista em pré-ordem, sem pastas vazias nem pastas-ponte', () => {
    expect(tree.map((c) => c.id)).toEqual(['R', 'A', 'L', 'M', 'T2']);
  });
  it('pasta-ponte é substituída pela filha, que herda o pai', () => {
    expect(byId.get('L')!.parentId).toBe('A');
    expect(byId.get('T2')!.parentId).toBe('R');
    expect(byId.get('R')!.childIds).toEqual(['A', 'T2']);
    expect(byId.get('A')!.childIds).toEqual(['L', 'M']);
  });
  it('ordena arquivos numericamente', () => {
    expect(byId.get('L')!.fileIds).toEqual(['f2', 'f10']);
  });
  it('mantém a raiz mesmo sem arquivos diretos', () => {
    expect(byId.get('R')!.parentId).toBeNull();
    expect(byId.get('R')!.fileIds).toEqual([]);
  });
  it('colapsa cadeias de pastas-ponte', () => {
    const chain = buildTree({
      rootId: 'R',
      folders: [
        { id: 'R', name: 'R', parentId: null },
        { id: 'P1', name: 'P1', parentId: 'R' },
        { id: 'P2', name: 'P2', parentId: 'P1' },
        { id: 'P3', name: 'P3', parentId: 'P2' },
        { id: 'Q', name: 'Q', parentId: 'R' },
      ],
      files: [
        { id: 'a', name: 'a.mp3', parentId: 'P3', md5: '1', size: 1 },
        { id: 'b', name: 'b.mp3', parentId: 'Q', md5: '2', size: 1 },
      ],
    });
    expect(chain.map((c) => [c.id, c.parentId])).toEqual([['R', null], ['P3', 'R'], ['Q', 'R']]);
  });
});
