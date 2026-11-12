export type Route = { name: 'home' } | { name: 'collection'; id: string } | { name: 'search'; q: string } | { name: 'credits' } | { name: 'install' };

export function parseHash(hash: string): Route {
  try {
    const h = hash.replace(/^#/, '');
    if (h === '/creditos') return { name: 'credits' };
    if (h === '/instalar') return { name: 'install' };
    const m = h.match(/^\/c\/([^/?]+)$/);
    if (m) return { name: 'collection', id: decodeURIComponent(m[1]) };
    if (h === '/busca' || h.startsWith('/busca?')) {
      return { name: 'search', q: new URLSearchParams(h.split('?')[1] ?? '').get('q') ?? '' };
    }
  } catch {
    // hash malformado (ex.: "%" solto): cai no início em vez de quebrar a página
  }
  return { name: 'home' };
}

export function hrefFor(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'collection':
      return `#/c/${encodeURIComponent(r.id)}`;
    case 'search':
      return `#/busca?q=${encodeURIComponent(r.q)}`;
    case 'credits':
      return '#/creditos';
    case 'install':
      return '#/instalar';
  }
}
