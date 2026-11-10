export type Route = { name: 'home' } | { name: 'collection'; id: string } | { name: 'search'; q: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const m = h.match(/^\/c\/([^/?]+)$/);
  if (m) return { name: 'collection', id: decodeURIComponent(m[1]) };
  if (h === '/busca' || h.startsWith('/busca?')) {
    return { name: 'search', q: new URLSearchParams(h.split('?')[1] ?? '').get('q') ?? '' };
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
  }
}
