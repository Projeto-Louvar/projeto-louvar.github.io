import { describe, expect, it, vi } from 'vitest';
import { collectionDownloadMode, detectPlatform, downloadSequential } from '../../web/src/downloads';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
};

describe('detectPlatform', () => {
  it('reconhece iPhone e iPad (que se apresenta como Mac com toque)', () => {
    expect(detectPlatform(UA.iphone, 5)).toBe('ios');
    expect(detectPlatform(UA.ipadOS, 5)).toBe('ios');
  });
  it('Mac sem toque é computador', () => {
    expect(detectPlatform(UA.ipadOS, 0)).toBe('desktop');
  });
  it('Android e Windows', () => {
    expect(detectPlatform(UA.android, 5)).toBe('android');
    expect(detectPlatform(UA.windows, 0)).toBe('desktop');
  });
});

describe('collectionDownloadMode', () => {
  it('computador usa zip quando existe', () => {
    expect(collectionDownloadMode('desktop', true)).toBe('zip');
    expect(collectionDownloadMode('desktop', false)).toBe('sequential');
  });
  it('Android baixa em sequência; iPhone não oferece', () => {
    expect(collectionDownloadMode('android', true)).toBe('sequential');
    expect(collectionDownloadMode('ios', true)).toBe('none');
  });
});

describe('downloadSequential', () => {
  it('clica cada URL em ordem, esperando entre elas, e informa o progresso', async () => {
    const click = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    const progress: [number, number][] = [];
    await downloadSequential(['a', 'b', 'c'], (d, n) => progress.push([d, n]), { click, wait, delayMs: 1500 });
    expect(click.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1500);
    expect(progress).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
  });
});
