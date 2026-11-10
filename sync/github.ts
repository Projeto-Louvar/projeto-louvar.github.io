import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';

export interface ReleaseAsset { id: number; name: string; size: number }
export interface Release { id: number; tag: string; assets: Map<string, ReleaseAsset> }

export class Releases {
  private cache = new Map<string, Release>();
  readonly repoBase: string;

  constructor(private token: string, private repo: string) {
    this.repoBase = `https://github.com/${repo}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...extra,
    };
  }

  private api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: this.headers(init.body ? { 'content-type': 'application/json' } : {}),
    });
  }

  private async load(id: number, tag: string): Promise<Release> {
    const assets = new Map<string, ReleaseAsset>();
    for (let page = 1; ; page++) {
      const r = await this.api(`/releases/${id}/assets?per_page=100&page=${page}`);
      if (!r.ok) throw new Error(`assets ${tag}: HTTP ${r.status} ${await r.text()}`);
      const list = (await r.json()) as ReleaseAsset[];
      for (const a of list) assets.set(a.name, { id: a.id, name: a.name, size: a.size });
      if (list.length < 100) break;
    }
    const rel = { id, tag, assets };
    this.cache.set(tag, rel);
    return rel;
  }

  async get(tag: string): Promise<Release | null> {
    const hit = this.cache.get(tag);
    if (hit) return hit;
    const res = await this.api(`/releases/tags/${encodeURIComponent(tag)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`release ${tag}: HTTP ${res.status} ${await res.text()}`);
    const { id } = (await res.json()) as { id: number };
    return this.load(id, tag);
  }

  async ensure(tag: string, title: string): Promise<Release> {
    const existing = await this.get(tag);
    if (existing) return existing;
    const res = await this.api('/releases', {
      method: 'POST',
      body: JSON.stringify({ tag_name: tag, name: title, body: 'Áudios publicados automaticamente pelo sync.', make_latest: 'false' }),
    });
    if (!res.ok) throw new Error(`criar release ${tag}: HTTP ${res.status} ${await res.text()}`);
    const { id } = (await res.json()) as { id: number };
    const rel = { id, tag, assets: new Map<string, ReleaseAsset>() };
    this.cache.set(tag, rel);
    return rel;
  }

  hasSameSize(rel: Release, name: string, size: number): boolean {
    return rel.assets.get(name)?.size === size;
  }

  async upload(rel: Release, name: string, path: string, contentType: string, opts: { force?: boolean } = {}): Promise<void> {
    const size = statSync(path).size;
    if (!opts.force && this.hasSameSize(rel, name, size)) return;
    if (rel.assets.has(name)) await this.deleteAsset(rel, name);
    const res = await fetch(
      `https://uploads.github.com/repos/${this.repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`,
      {
        method: 'POST',
        headers: this.headers({ 'content-type': contentType, 'content-length': String(size) }),
        body: Readable.toWeb(createReadStream(path)) as ReadableStream,
        duplex: 'half',
      } as RequestInit,
    );
    if (!res.ok) throw new Error(`enviar ${name}: HTTP ${res.status} ${await res.text()}`);
    const a = (await res.json()) as ReleaseAsset;
    rel.assets.set(a.name, { id: a.id, name: a.name, size: a.size });
  }

  async deleteAsset(rel: Release, name: string): Promise<void> {
    const a = rel.assets.get(name);
    if (!a) return;
    const res = await this.api(`/releases/assets/${a.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`apagar ${name}: HTTP ${res.status}`);
    rel.assets.delete(name);
  }

  async deleteByUrl(url: string): Promise<void> {
    const prefix = `${this.repoBase}/releases/download/`;
    if (!url.startsWith(prefix)) return;
    const [tag, ...rest] = url.slice(prefix.length).split('/');
    const rel = await this.get(tag);
    if (rel) await this.deleteAsset(rel, decodeURIComponent(rest.join('/')));
  }
}
