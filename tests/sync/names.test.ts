import { describe, expect, it } from 'vitest';
import { contentTypeFor, safeAssetName, slugify, uniqueEntryNames } from '../../sync/names';

describe('slugify', () => {
  it('remove acentos e símbolos', () => {
    expect(slugify('Louvor & Adoração')).toBe('louvor-adoracao');
    expect(slugify('  Bônus 2 - Lançamentos 2026 ')).toBe('bonus-2-lancamentos-2026');
  });
});

describe('safeAssetName', () => {
  it('gera nome ASCII mantendo a extensão em minúsculas', () => {
    const taken = new Set<string>();
    expect(safeAssetName('18 - Aline Barros - Consagração _ Louvor ao Rei (Ao Vivo).MP3', taken))
      .toBe('18-aline-barros-consagracao-louvor-ao-rei-ao-vivo.mp3');
    expect(taken.has('18-aline-barros-consagracao-louvor-ao-rei-ao-vivo.mp3')).toBe(true);
  });
  it('resolve colisões com sufixo', () => {
    const taken = new Set(['hino.mp3']);
    expect(safeAssetName('Hino.mp3', taken)).toBe('hino-2.mp3');
    expect(safeAssetName('Hino.mp3', taken)).toBe('hino-3.mp3');
  });
  it('usa "faixa" quando não sobra nada', () => {
    expect(safeAssetName('***.mp3', new Set())).toBe('faixa.mp3');
  });
  it('limita o tamanho do nome base a 80 caracteres', () => {
    const name = safeAssetName(`${'a'.repeat(200)}.mp3`, new Set());
    expect(name).toBe(`${'a'.repeat(80)}.mp3`);
  });
});

describe('contentTypeFor', () => {
  it('mapeia extensões de áudio e zip', () => {
    expect(contentTypeFor('x.mp3')).toBe('audio/mpeg');
    expect(contentTypeFor('x.m4a')).toBe('audio/mp4');
    expect(contentTypeFor('x.aac')).toBe('audio/aac');
    expect(contentTypeFor('x.ogg')).toBe('audio/ogg');
    expect(contentTypeFor('x.opus')).toBe('audio/ogg');
    expect(contentTypeFor('x.zip')).toBe('application/zip');
    expect(contentTypeFor('x.bin')).toBe('application/octet-stream');
  });
});

describe('uniqueEntryNames', () => {
  it('numera nomes repetidos', () => {
    expect(uniqueEntryNames(['a.mp3', 'b.mp3', 'a.mp3', 'a.mp3'])).toEqual(['a.mp3', 'b.mp3', 'a (2).mp3', 'a (3).mp3']);
  });
});
