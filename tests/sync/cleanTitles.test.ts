import { describe, expect, it } from 'vitest';
import { titlesFor, type NamedFile } from '../../sync/cleanTitles';

const run = (files: [string, string][], folder = 'F') =>
  [...titlesFor(files.map(([id, name]) => ({ id, name, folderId: folder }) as NamedFile)).values()];

describe('limpeza de nomes', () => {
  it('"+" no lugar de espaço e numeração (hinos infantis)', () => {
    expect(run([['1', '001+A+eleicao+das+arvores.mp3'], ['2', '003+Cada+dia+o+dia+inteiro (1).mp3']])).toEqual([
      { title: 'A eleição das árvores', artist: '' },
      { title: 'Cada dia o dia inteiro', artist: '' },
    ]);
  });

  it('o que se repete na pasta inteira sai do título e vira o cantor', () => {
    expect(run([
      ['1', '44. Volte  JAIR PIRES.mp3'], ['2', '33. Eu Sei  JAIR PIRES.mp3'],
      ['3', '7. Junto de Deus  JAIR PIRES.mp3'], ['4', '30. Sangue Protetor  JAIR PIRES.mp3'],
    ]).map((x) => `${x.title} | ${x.artist}`)).toEqual(['Volte | Jair Pires', 'Eu Sei | Jair Pires', 'Junto de Deus | Jair Pires', 'Sangue Protetor | Jair Pires']);
  });

  it('"Ao Vivo" separado por traço vai para o título; álbum e ano saem', () => {
    expect(run([['1', 'Nosso General - Ao Vivo.mp3']])[0]).toEqual({ title: 'Nosso General (Ao Vivo)', artist: '' });
    expect(run([['1', '11. Cassiane Santana - Criancinhas (LP Cristo é a Força) - 1982.mp3']])[0]).toEqual({ title: 'Criancinhas', artist: 'Cassiane Santana' });
    expect(run([['1', 'Fernandinho - Caia Fogo (Ao Vivo - HSBC Arena RJ).mp3']])[0]).toEqual({ title: 'Caia Fogo (Ao Vivo)', artist: 'Fernandinho' });
  });

  it('formato do Spotify: título repetido ou título + cantor + álbum', () => {
    expect(run([['1', 'Doce Amor Ton Carfi,Jefferson Moraes Doce Amor.mp3']])[0].title).toBe('Doce Amor');
    expect(run([['1', '01 Jesus Kemuel (Jesus).mp3']])[0]).toEqual({ title: 'Jesus', artist: 'Kemuel' });
  });

  it('cantores frequentes no acervo desfazem ordem trocada', () => {
    const files: [string, string][] = [
      ['1', 'Fernandinho - Grandes Coisas.mp3'], ['2', 'Fernandinho - Faz Chover.mp3'], ['3', 'Fernandinho - Santo.mp3'],
      ['4', 'Se não for pra Te adorar - Fernandinho.mp3'],
    ];
    const r = titlesFor(files.map(([id, name], i) => ({ id, name, folderId: `F${i}` })));
    expect(r.get('4')).toEqual({ title: 'Se não for pra Te adorar', artist: 'Fernandinho' });
  });

  it('acentos quebrados e "_" do Spotify', () => {
    expect(run([['1', 'Uma Nova HistÃ³ria.mp3']])[0].title).toBe('Uma Nova História');
    expect(run([['1', 'Aquieta Minh_alma.mp3']])[0].title).toBe("Aquieta Minh'alma");
    expect(run([['1', 'Santo Espírito (feat_ Leonardo Gonçalves).mp3']])[0].title).toBe('Santo Espírito (feat. Leonardo Gonçalves)');
  });

  it('correção manual vence as regras', () => {
    const r = titlesFor([{ id: 'x', name: '001+A+eleicao+das+arvores.mp3', folderId: 'F' }], { x: { title: 'A Eleição das Árvores' } });
    expect(r.get('x')!.title).toBe('A Eleição das Árvores');
  });
});

describe('limpeza de nomes — armadilhas', () => {
  it('"Dia Após Dia" não é "título cantor título"', () => {
    expect(run([['1', 'Valesca Mayssa  Dia Após Dia [Clipe Oficial].m4a']])[0]).toEqual({ title: 'Dia Após Dia', artist: 'Valesca Mayssa' });
  });
  it('"Lyrics" no fim não vira título', () => {
    expect(run([['1', 'Thats How You Change The World  Newsboys  Lyrics.mp3']])[0].title).toBe('Thats How You Change The World');
  });
  it('emoji sai do nome', () => {
    expect(run([['1', 'Débora Cavalcante -  💭 Sonhos - PLAYBACK.mp3']])[0]).toEqual({ title: 'Sonhos (Playback)', artist: 'Débora Cavalcante' });
  });
});

describe('limpeza de nomes — "Música - Ao Vivo - Cantor - Álbum"', () => {
  it('a versão logo depois do primeiro pedaço indica que ele é a música', () => {
    expect(run([['1', 'Muralhas - Ao Vivo - André Valadão - Crer para Ver (Ao Vivo).mp3']])[0]).toEqual({ title: 'Muralhas (Ao Vivo)', artist: 'André Valadão' });
    expect(run([['1', 'Maranata - Ao Vivo - Ministério Avivah, Fernanda Madaloni - Maranata.mp3']])[0]).toEqual({ title: 'Maranata (Ao Vivo)', artist: 'Ministério Avivah, Fernanda Madaloni' });
  });
});
