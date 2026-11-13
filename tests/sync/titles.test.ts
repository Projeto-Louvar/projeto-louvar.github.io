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

describe('parseTrackName — nomes vindos de vídeos', () => {
  const cases: [string, { artist: string; title: string }][] = [
    ['Raquel Olliver  Sempre foi Deus [Clipe Oficial] [1].m4a', { artist: '', title: 'Raquel Olliver – Sempre foi Deus' }],
    ['Isadora Pompeo - Ovelhinha (Ao Vivo) [1].m4a', { artist: 'Isadora Pompeo', title: 'Ovelhinha (Ao Vivo)' }],
    ['ACENDE OUTRA VEZ┃JEFFERSON & SUELLEN (LIVE SESSION - AO VIVO).m4a', { artist: 'Acende Outra Vez', title: 'Jefferson & Suellen (Live Session - Ao Vivo)' }],
    ['GABRIELA ROCHA - ME ATRAIU (AO VIVO).m4a', { artist: 'Gabriela Rocha', title: 'Me Atraiu (Ao Vivo)' }],
    ['Maria Marçal - Deixa (Clipe Oficial MK Music).m4a', { artist: 'Maria Marçal', title: 'Deixa' }],
    ['Sued Silva  Reacende a Chama [Vídeo Letra] [1].m4a', { artist: '', title: 'Sued Silva – Reacende a Chama' }],
    ['Sou um dos Dez I Clipe Oficial [1].m4a', { artist: '', title: 'Sou um dos Dez' }],
    ['Fernandinho  Único (Álbum Único - Live) [1].m4a', { artist: '', title: 'Fernandinho – Único (Álbum Único - Live)' }],
    ['Maria Marçal - Cura  DVD CURA [1].m4a', { artist: 'Maria Marçal', title: 'Cura DVD CURA' }],
    ['DJ PV - TU ÉS BOM.mp3', { artist: 'DJ PV', title: 'Tu És Bom' }],
  ];
  for (const [file, expected] of cases) it(file, () => expect(parseTrackName(file)).toEqual(expected));
});
