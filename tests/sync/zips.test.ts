import { describe, expect, it } from 'vitest';
import { splitIntoParts, zipAssetName } from '../../sync/zips';

describe('splitIntoParts', () => {
  it('mantém a ordem e respeita o limite', () => {
    const items = [5, 4, 3, 6, 1].map((size, i) => ({ id: i, size }));
    expect(splitIntoParts(items, 10).map((p) => p.map((x) => x.id))).toEqual([[0, 1], [2, 3, 4]]);
  });
  it('item maior que o limite vai sozinho', () => {
    const items = [{ size: 3 }, { size: 50 }, { size: 3 }];
    expect(splitIntoParts(items, 10).map((p) => p.length)).toEqual([1, 1, 1]);
  });
  it('lista vazia gera zero partes', () => {
    expect(splitIntoParts([], 10)).toEqual([]);
  });
});

describe('zipAssetName', () => {
  it('uma parte não leva sufixo', () => {
    expect(zipAssetName('louvor', 1, 1)).toBe('louvor.zip');
  });
  it('várias partes são numeradas a partir de 1', () => {
    expect(zipAssetName('louvor', 2, 3)).toBe('louvor-parte-2.zip');
  });
});
