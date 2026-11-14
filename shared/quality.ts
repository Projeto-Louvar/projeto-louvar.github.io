// Qual cópia de uma mesma música é a melhor: maior bitrate (ou tamanho por minuto, se o bitrate faltar);
// entre iguais, o nome de arquivo mais limpo. Cópia sem medição perde para qualquer cópia medida.
interface Copy { size: number; dur?: number; kbps?: number; fileName: string }

export function qualityScore(c: Copy): number {
  if (c.kbps && c.kbps > 0) return c.kbps;
  if (c.dur && c.dur > 0) return (c.size * 8) / 1000 / c.dur; // kbps calculado pelo tamanho por segundo
  return c.size / 1e9; // sem medição: fica abaixo de qualquer medida; desempata pelo tamanho
}

const messiness = (name: string) => (/\[\d+\]|\(\d+\)|_\d+\.\w+$|-{3,}/.test(name) ? 1000 : 0) + name.length;

/** Melhor cópia da lista (a lista não pode estar vazia). */
export function bestCopy<T extends Copy>(list: T[]): T {
  return list.reduce((best, c) => {
    const d = qualityScore(c) - qualityScore(best);
    if (Math.abs(d) > 1e-9) return d > 0 ? c : best;
    return messiness(c.fileName) < messiness(best.fileName) ? c : best;
  });
}
