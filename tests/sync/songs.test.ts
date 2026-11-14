import { describe, expect, it } from 'vitest';
import { baseTitle, planSongs, versionOf, type SongTrack } from '../../sync/songs';
import { parseProbe } from '../../sync/probe';

let n = 0;
const tr = (title: string, artist: string, extra: Partial<SongTrack> = {}): SongTrack => {
  n++;
  return { id: `t${n}`, title, artist, fileName: `${artist ? `${artist} - ` : ''}${title}.mp3`, md5: `m${n}`, size: 10_000_000, collectionId: 'C', ...extra };
};
const sameSong = (plan: ReturnType<typeof planSongs>, a: SongTrack, b: SongTrack) => plan.songOf.get(a.id) === plan.songOf.get(b.id);

describe('mesma música', () => {
  it('mesmo arquivo (md5) é sempre a mesma música', () => {
    const a = tr('Raridade', 'Anderson Freire'), b = tr('Outro nome qualquer', '', { md5: a.md5 });
    expect(sameSong(planSongs([a, b]), a, b)).toBe(true);
  });

  it('mesmo título + versão + cantor junta, mesmo com arquivos diferentes', () => {
    const a = tr('Raridade', 'Anderson Freire'), b = tr('Raridade', 'Anderson Freire', { fileName: '10 - Anderson Freire - Raridade.mp3' });
    expect(sameSong(planSongs([a, b]), a, b)).toBe(true);
  });

  it('ao vivo × estúdio são músicas diferentes (versão lida também no nome do arquivo)', () => {
    const estudio = tr('Tudo a Ver Com Ele', 'Central 3');
    const vivo = tr('Tudo a Ver Com Ele', 'Central 3', { fileName: 'Tudo a Ver Com Ele - Ao Vivo Central 3,André Aquino.mp3' });
    const playback = tr('Tudo a Ver Com Ele (Playback)', 'Central 3');
    const p = planSongs([estudio, vivo, playback]);
    expect(sameSong(p, estudio, vivo)).toBe(false);
    expect(sameSong(p, estudio, playback)).toBe(false);
    expect(versionOf('Tudo a Ver Com Ele', 'Tudo a Ver Com Ele - Ao Vivo.mp3')).toBe('aovivo');
  });

  it('mesmo título com cantores diferentes são músicas diferentes', () => {
    const a = tr('Santo Espírito', 'Paulo César Baruk'), b = tr('Santo Espírito', 'Laura Souguellis');
    expect(sameSong(planSongs([a, b]), a, b)).toBe(false);
  });

  it('sem cantor: junta só com cantor único para o título e duração compatível', () => {
    const com = tr('Tuas Águas', 'Julia Vitória', { dur: 245 });
    const sem = tr('Tuas Águas', '', { dur: 246, fileName: '01 Tuas Águas.mp3' });
    const longe = tr('Tuas Águas', '', { dur: 300, fileName: '02 Tuas Águas.mp3' });
    const p = planSongs([com, sem, longe]);
    expect(sameSong(p, com, sem)).toBe(true);
    expect(sameSong(p, com, longe)).toBe(false); // duração incompatível: na dúvida, não junta
  });

  it('sem cantor e título com 2 cantores no acervo: não junta', () => {
    const a = tr('Aleluia', 'Gabriela Rocha'), b = tr('Aleluia', 'Fernandinho'), sem = tr('Aleluia', '');
    const p = planSongs([a, b, sem]);
    expect(sameSong(p, sem, a) || sameSong(p, sem, b)).toBe(false);
  });

  it('sem cantor dos dois lados e arquivos diferentes: não junta', () => {
    const a = tr('Ele Vem', ''), b = tr('Ele Vem', '');
    expect(sameSong(planSongs([a, b]), a, b)).toBe(false);
  });

  it('acha o cantor escondido no nome do arquivo (formato do Spotify)', () => {
    const k1 = tr('Hosana', 'Gabriela Rocha'), k2 = tr('Leão', 'Gabriela Rocha');
    const sem = tr('Hosana', '', { fileName: 'Hosana - Ao Vivo Gabriela Rocha,Lukas Agustinho Hosana (Ao Vivo).mp3' });
    const p = planSongs([k1, k2, sem]);
    expect(p.artistFound.get(sem.id)).toBe('Gabriela Rocha');
    expect(sameSong(p, sem, k1)).toBe(false); // a do arquivo é ao vivo; a outra, estúdio
  });

  it('canônico: maior bitrate; empate fica com o nome mais limpo', () => {
    const fraca = tr('Raridade', 'Anderson Freire', { kbps: 128 });
    const boa = tr('Raridade', 'Anderson Freire', { kbps: 320 });
    const p = planSongs([fraca, boa]);
    expect(p.canonical.get(p.songOf.get(fraca.id)!)).toBe(boa.id);
    const suja = tr('Bálsamo', 'Rebeca Carvalho', { kbps: 256, fileName: 'Bálsamo [1].mp3' });
    const limpa = tr('Bálsamo', 'Rebeca Carvalho', { kbps: 256, fileName: 'Bálsamo.mp3' });
    const p2 = planSongs([suja, limpa]);
    expect(p2.canonical.get(p2.songOf.get(suja.id)!)).toBe(limpa.id);
  });

  it('título base ignora versão, feat. e numeração', () => {
    expect(baseTitle('01 Jesus Cristo Basta (Jesucristo Basta) (Ao Vivo)')).toBe('jesus cristo basta');
    expect(baseTitle('Tu És Real (feat. Fernandinho / Gabriela Rocha)')).toBe('tu es real');
  });
});

describe('medição (ffprobe)', () => {
  it('lê duração e bitrate do áudio', () => {
    expect(parseProbe('{"streams":[{"bit_rate":"320000","duration":"245.53"}],"format":{"duration":"245.6"}}')).toEqual({ dur: 245.5, kbps: 320 });
    expect(parseProbe('{"streams":[],"format":{"duration":"200","bit_rate":"900000"}}')).toEqual({ dur: 200, kbps: 0 });
    expect(parseProbe('lixo')).toBeNull();
  });
});
