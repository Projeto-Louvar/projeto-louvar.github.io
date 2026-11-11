import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';

export interface ReleaseAsset { id: number; name: string; size: number; state: string }
export interface Release { id: number; tag: string; assets: Map<string, ReleaseAsset> }

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

const DEFAULT_WAIT_MS = 60_000;
const MAX_RATE_LIMIT_RETRIES = 5;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Milissegundos a esperar se a resposta for um limite de uso do GitHub; null caso contrário.
export function rateLimitWait(status: number, headers: Headers | Record<string, string>, body: string, nowMs: number): number | null {
  const get = (k: string): string | null => {
    if (headers instanceof Headers) return headers.get(k);
    const hit = Object.keys(headers).find((h) => h.toLowerCase() === k);
    return hit === undefined ? null : headers[hit];
  };
  const retryAfter = get('retry-after');
  const limited = status === 429 || (status === 403 && (get('x-ratelimit-remaining') === '0' || retryAfter !== null || /rate limit/i.test(body)));
  if (!limited) return null;
  const ra = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(ra) && ra >= 0) return Math.ceil(ra * 1000);
  const reset = Number(get('x-ratelimit-reset'));
  if (get('x-ratelimit-reset') !== null && Number.isFinite(reset)) return Math.max(0, reset * 1000 - nowMs);
  return DEFAULT_WAIT_MS;
}

export interface ReleasesOptions {
  /** epoch ms depois do qual não se deve mais dormir esperando limite de uso */
  deadline?: number;
  /** intervalo mínimo entre inícios de uploads consecutivos (ms) */
  uploadIntervalMs?: number;
}

export class Releases {
  private cache = new Map<string, Release>();
  readonly repoBase: string;
  private lastUploadAt = 0;
  private deadline: number;
  private uploadIntervalMs: number;

  constructor(private token: string, private repo: string, deadline?: number, uploadIntervalMs = 7500) {
    this.repoBase = `https://github.com/${repo}`;
    this.deadline = deadline ?? Infinity;
    this.uploadIntervalMs = uploadIntervalMs;
  }

  // Executa a requisição; em limite de uso espera (se couber no prazo) e repete.
  private async withRateLimit(make: () => Promise<Response>): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await make();
      if (res.status !== 429 && res.status !== 403) return res;
      const body = await res.clone().text();
      const wait = rateLimitWait(res.status, res.headers, body, Date.now());
      if (wait === null) return res;
      if (attempt >= MAX_RATE_LIMIT_RETRIES) throw new RateLimitError('Limite de uso do GitHub persistiu após várias tentativas.');
      if (Date.now() + wait > this.deadline) {
        throw new RateLimitError(`Limite de uso do GitHub: a espera de ${Math.ceil(wait / 1000)} s não cabe no tempo restante.`);
      }
      console.log(`Limite de uso do GitHub; aguardando ${Math.ceil(wait / 1000)} s antes de tentar de novo.`);
      await sleep(wait);
    }
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
    return this.withRateLimit(() =>
      fetch(`https://api.github.com/repos/${this.repo}${path}`, {
        ...init,
        headers: this.headers(init.body ? { 'content-type': 'application/json' } : {}),
      }),
    );
  }

  private async listAssets(id: number, tag: string): Promise<Map<string, ReleaseAsset>> {
    const assets = new Map<string, ReleaseAsset>();
    for (let page = 1; ; page++) {
      const r = await this.api(`/releases/${id}/assets?per_page=100&page=${page}`);
      if (!r.ok) throw new Error(`assets ${tag}: HTTP ${r.status} ${await r.text()}`);
      const list = (await r.json()) as ReleaseAsset[];
      for (const a of list) assets.set(a.name, { id: a.id, name: a.name, size: a.size, state: a.state });
      if (list.length < 100) break;
    }
    return assets;
  }

  // Recarrega a lista de assets da release in place (mantém a mesma instância de rel).
  private async refresh(rel: Release): Promise<void> {
    const fresh = await this.listAssets(rel.id, rel.tag);
    rel.assets.clear();
    for (const [name, a] of fresh) rel.assets.set(name, a);
  }

  private async load(id: number, tag: string): Promise<Release> {
    const assets = await this.listAssets(id, tag);
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

  // Só considera "igual" um asset totalmente enviado (state 'uploaded'); um 'starter' é resto de upload interrompido.
  hasSameSize(rel: Release, name: string, size: number): boolean {
    const a = rel.assets.get(name);
    return a !== undefined && a.state === 'uploaded' && a.size === size;
  }

  async upload(rel: Release, name: string, path: string, contentType: string, opts: { force?: boolean } = {}): Promise<void> {
    const size = statSync(path).size;
    if (!opts.force && this.hasSameSize(rel, name, size)) return;
    if (rel.assets.has(name)) await this.deleteAsset(rel, name);
    // cada tentativa recria o stream de leitura; o ritmo entre inícios de POST evita o limite secundário
    const post = () =>
      this.withRateLimit(async () => {
        const gap = this.lastUploadAt + this.uploadIntervalMs - Date.now();
        if (gap > 0) await sleep(gap);
        this.lastUploadAt = Date.now();
        return fetch(
          `https://uploads.github.com/repos/${this.repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`,
          {
            method: 'POST',
            headers: this.headers({ 'content-type': contentType, 'content-length': String(size) }),
            body: Readable.toWeb(createReadStream(path)) as ReadableStream,
            duplex: 'half',
          } as RequestInit,
        );
      });
    let res = await post();
    if (res.status === 422) {
      // 422 already_exists: o cache estava desatualizado (asset 'starter' de tentativa anterior).
      await res.text();
      await this.refresh(rel);
      await this.deleteAsset(rel, name);
      res = await post();
    }
    if (!res.ok) throw new Error(`enviar ${name}: HTTP ${res.status} ${await res.text()}`);
    const a = (await res.json()) as ReleaseAsset;
    rel.assets.set(a.name, { id: a.id, name: a.name, size: a.size, state: a.state });
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
