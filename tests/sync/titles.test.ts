import { describe, expect, it } from 'vitest';
import { isAudioFile, parseTrackName } from '../../sync/titles';

describe('isAudioFile', () => {
  it('aceita formatos tocáveis no navegador, sem diferenciar maiúsculas', () => {
    for (const n of ['a.mp3', 'B.MP3', 'c.m4a', 'd.aac', 'e.ogg', 'f.opus']) expect(isAudioFile(n)).toBe(true);
  });
  it('rejeita vídeo, imagem e formatos não tocáveis', () => {
    for (const n of ['a.MP4', 'b.jpg', 'c.wma', 'd.wav', 'sem-extensao']) expect(isAudioFile(n)).toBe(false);
  });
});

describe('parseTrackName', () => {
  it('remove numeração, separa artista e troca " _ " por " / "', () => {
    expect(parseTrackName('18 - Aline Barros - Consagração _ Louvor ao Rei (Ao Vivo).mp3')).toEqual({
      artist: 'Aline Barros',
      title: 'Consagração / Louvor ao Rei (Ao Vivo)',
    });
  });
  it('aceita numeração com ponto ou parêntese', () => {
    expect(parseTrackName('01. Hosana.mp3')).toEqual({ artist: '', title: 'Hosana' });
    expect(parseTrackName('7) Hosana.mp3')).toEqual({ artist: '', title: 'Hosana' });
  });
  it('não remove números que fazem parte do título', () => {
    expect(parseTrackName('2025 Hino Novo.mp3')).toEqual({ artist: '', title: '2025 Hino Novo' });
  });
  it('sem " - " o artista fica vazio', () => {
    expect(parseTrackName('Ministério de Louvor Diante do Trono-Coração Igual Ao Teu.mp3')).toEqual({
      artist: '',
      title: 'Ministério de Louvor Diante do Trono-Coração Igual Ao Teu',
    });
  });
  it('troca _ solto por espaço e colapsa espaços', () => {
    expect(parseTrackName('Grupo_VP  -  Livre_sou.mp3')).toEqual({ artist: 'Grupo VP', title: 'Livre sou' });
  });
});
