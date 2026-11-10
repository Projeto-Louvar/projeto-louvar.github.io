# Site de Louvores — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site estilo "Spotify simplificado" (celular primeiro, público idoso) que toca e baixa o acervo de louvores do Google Drive, sincronizado automaticamente uma vez por dia.

**Architecture:** Um script Node (`sync/`) lê a árvore do Drive com conta de serviço, envia o áudio para GitHub Releases (um release por coleção), gera `.zip` por coleção e grava `web/public/catalog.json`. Um site estático (Vite + TypeScript sem framework, roteamento por hash) lê esse catálogo e roda no GitHub Pages. Um único workflow do GitHub Actions faz sync (diário/manual) e deploy.

**Tech Stack:** Node 22+, TypeScript 5.9, Vite 8, Vitest 5 (+ jsdom), Playwright, googleapis, archiver 7, sharp (só para gerar ícones), @fontsource/atkinson-hyperlegible.

Spec: `docs/superpowers/specs/2026-11-10-louvores-site-design.md`

## Global Constraints

- Idioma de toda interface e mensagens: português do Brasil.
- Pasta raiz do Drive: `1ak8DwNK4UeRQmKLpKhEao-XdyEj0Z8EC` ("Louvores - SVA", Drive compartilhado → sempre `supportsAllDrives: true`).
- Formatos aceitos: `.mp3`, `.m4a`, `.aac`, `.ogg`, `.opus`. Todo o resto é ignorado e contado no log.
- Tag de release por coleção: `c-<driveFolderId>`. URL de asset: `https://github.com/<owner>/<repo>/releases/download/<tag>/<assetName>`.
- Zip em modo store (sem compressão); parte máxima 1,9 GB (`1_900_000_000` bytes).
- Orçamento de tempo do sync: 300 min (variável `TIME_BUDGET_MIN`).
- Fonte base 20px; alvos de toque ≥ 56px; botões do player ≥ 64px de altura; linhas de faixa ≥ 72px.
- Cores chapadas, **sem degradê**. Paleta: `#1F4E79 #7A1F3D #2E6B3A #8A4B0F #4B2E83 #0F6E6E #9B2C2C #3D4F5C`.
- `<meta name="robots" content="noindex, nofollow">` em todas as páginas.
- `localStorage` sempre dentro de try/catch.
- Sem rolagem horizontal em 360px de largura.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Estrutura de arquivos

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, playwright.config.ts, .gitignore
shared/catalog.ts            tipos do catalog.json (usados por sync e web)
sync/titles.ts               isAudioFile, parseTrackName
sync/tree.ts                 tipos do Drive, buildTree (colapso, poda, ordenação)
sync/names.ts                slugify, safeAssetName, contentTypeFor, uniqueEntryNames
sync/zips.ts                 splitIntoParts, zipAssetName
sync/plan.ts                 PALETTE, tagFor, assetUrl, zipKeyFor, planSync, finalizeCatalog, orphanUrls
sync/drive.ts                createDrive, snapshotDrive, downloadToFile (I/O Google)
sync/github.ts               Releases (I/O GitHub)
sync/zipper.ts               buildZip (I/O rede + disco)
sync/main.ts                 orquestração do ciclo
scripts/make-sample.ts       gera áudios e catálogo de amostra
scripts/make-icons.ts        gera ícones PNG a partir de SVG
web/index.html
web/public/                  catalog.json, sample-audio/, icons/, manifest.webmanifest, sw.js, robots.txt
web/src/format.ts            countLabel, formatTime
web/src/router.ts            Route, parseHash, hrefFor
web/src/search.ts            normalize, searchTracks
web/src/storage.ts           safeGet, safeSet
web/src/catalogIndex.ts      CatalogIndex, loadCatalog
web/src/downloads.ts         detectPlatform, collectionDownloadMode, downloadSequential
web/src/player.ts            Player
web/src/dom.ts               h()
web/src/icons.ts             SVGs do player
web/src/components.ts        searchForm, tileGrid, trackList, downloadAll
web/src/views.ts             renderHome, renderCollection, renderSearch, renderNotFound, renderError
web/src/playerBar.ts         renderPlayerBar
web/src/main.ts              boot + roteamento
web/src/styles.css
tests/**                     Vitest
e2e/site.spec.ts             Playwright
.github/workflows/site.yml
SETUP.md                     guia do dono (configuração única)
```

---

### Task 1: Projeto base + parse de nomes de faixa

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `shared/catalog.ts`, `sync/titles.ts`
- Test: `tests/sync/titles.test.ts`

**Interfaces:**
- Produces: tipos `Catalog`, `Collection`, `Track` (shared/catalog.ts); `isAudioFile(name: string): boolean`; `parseTrackName(fileName: string): { title: string; artist: string }`.

- [ ] **Step 1: Criar arquivos de configuração**

`package.json`:
```json
{
  "name": "louvores-site",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc",
    "check": "tsc && vitest run",
    "e2e": "playwright test",
    "sync": "tsx sync/main.ts",
    "sample": "tsx scripts/make-sample.ts",
    "icons": "tsx scripts/make-icons.ts"
  }
}
```

Instalar dependências:
```bash
npm i googleapis@189 archiver@7 @fontsource/atkinson-hyperlegible@5
npm i -D typescript@5.9 vite@8 vitest@5 jsdom@31 tsx@4 @playwright/test@1 @types/node@22 @types/archiver@6 sharp@0.35
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["shared", "sync", "web/src", "scripts", "tests", "e2e", "*.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

`.gitignore`:
```
node_modules/
dist/
test-results/
playwright-report/
*.local
.env
service-account*.json
```

`shared/catalog.ts`:
```ts
export interface Track {
  id: string;          // id do arquivo no Drive
  title: string;
  artist: string;      // '' quando não identificado
  fileName: string;    // nome original no Drive (usado dentro do .zip)
  collectionId: string;
  md5: string;
  size: number;        // bytes
  url: string;         // URL pública do áudio
}

export interface Collection {
  id: string;          // id da pasta no Drive
  name: string;
  parentId: string | null;
  color: string;       // cor chapada da capa
  childIds: string[];
  trackIds: string[];  // faixas diretas, em ordem
  zipUrls: string[];   // 0, 1 ou várias partes
  zipKey: string;      // hash das faixas que o zip atual contém ('' se nenhum)
}

export interface Catalog {
  generatedAt: string;
  rootId: string;
  sample?: boolean;    // true no catálogo de amostra (o sync o ignora como estado)
  collections: Collection[];
  tracks: Track[];
}
```

- [ ] **Step 2: Escrever o teste que falha**

`tests/sync/titles.test.ts`:
```ts
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
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/sync/titles.test.ts`
Expected: FAIL — `Failed to resolve import "../../sync/titles"`.

- [ ] **Step 4: Implementar**

`sync/titles.ts`:
```ts
const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.ogg', '.opus'];

export function isAudioFile(name: string): boolean {
  const n = name.toLowerCase();
  return AUDIO_EXT.some((ext) => n.endsWith(ext));
}

export function parseTrackName(fileName: string): { title: string; artist: string } {
  let s = fileName.replace(/\.[^.]+$/, '');
  s = s.replace(/\s+_\s+/g, ' / ').replace(/_/g, ' ');
  s = s.replace(/^\s*\d{1,3}\s*[-.)]\s*/, '');
  s = s.replace(/\s+/g, ' ').trim();
  const i = s.indexOf(' - ');
  if (i > 0) {
    const title = s.slice(i + 3).trim();
    if (title) return { artist: s.slice(0, i).trim(), title };
  }
  return { artist: '', title: s };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/sync/titles.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: base do projeto e leitura de nomes de faixa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Árvore de coleções a partir do Drive

**Files:**
- Create: `sync/tree.ts`
- Test: `tests/sync/tree.test.ts`

**Interfaces:**
- Produces:
```ts
interface DriveFolder { id: string; name: string; parentId: string | null }
interface DriveAudio { id: string; name: string; parentId: string; md5: string; size: number }
interface DriveSnapshot { rootId: string; folders: DriveFolder[]; files: DriveAudio[]; skipped?: string[] }
interface TreeCollection { id: string; name: string; parentId: string | null; childIds: string[]; fileIds: string[] }
function buildTree(snap: DriveSnapshot): TreeCollection[]   // pré-ordem, raiz primeiro
function compareNames(a: string, b: string): number          // ordenação pt-BR numérica
```

Regras: (1) pastas sem áudio na subárvore somem (exceto a raiz); (2) pasta não-raiz sem áudio direto e com exatamente uma filha é substituída pela filha (que herda o `parentId`); (3) filhas e arquivos ordenados por nome com `localeCompare('pt-BR', { numeric: true, sensitivity: 'base' })`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/sync/tree.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildTree, type DriveSnapshot } from '../../sync/tree';

const snap: DriveSnapshot = {
  rootId: 'R',
  folders: [
    { id: 'R', name: 'Louvores', parentId: null },
    { id: 'A', name: 'Biblioteca', parentId: 'R' },
    { id: 'G', name: 'Gospel', parentId: 'A' },
    { id: 'L', name: 'Louvor', parentId: 'G' },
    { id: 'M', name: 'Medley', parentId: 'A' },
    { id: 'X', name: 'Vazia', parentId: 'A' },
    { id: 'T', name: 'Top', parentId: 'R' },
    { id: 'T2', name: 'Top Hits', parentId: 'T' },
  ],
  files: [
    { id: 'f10', name: '10 - b.mp3', parentId: 'L', md5: 'm10', size: 1 },
    { id: 'f2', name: '2 - a.mp3', parentId: 'L', md5: 'm2', size: 1 },
    { id: 'f4', name: 'x.mp3', parentId: 'M', md5: 'm4', size: 1 },
    { id: 'f3', name: 'y.mp3', parentId: 'T2', md5: 'm3', size: 1 },
  ],
};

describe('buildTree', () => {
  const tree = buildTree(snap);
  const byId = new Map(tree.map((c) => [c.id, c]));

  it('lista em pré-ordem, sem pastas vazias nem pastas-ponte', () => {
    expect(tree.map((c) => c.id)).toEqual(['R', 'A', 'L', 'M', 'T2']);
  });
  it('pasta-ponte é substituída pela filha, que herda o pai', () => {
    expect(byId.get('L')!.parentId).toBe('A');
    expect(byId.get('T2')!.parentId).toBe('R');
    expect(byId.get('R')!.childIds).toEqual(['A', 'T2']);
    expect(byId.get('A')!.childIds).toEqual(['L', 'M']);
  });
  it('ordena arquivos numericamente', () => {
    expect(byId.get('L')!.fileIds).toEqual(['f2', 'f10']);
  });
  it('mantém a raiz mesmo sem arquivos diretos', () => {
    expect(byId.get('R')!.parentId).toBeNull();
    expect(byId.get('R')!.fileIds).toEqual([]);
  });
  it('colapsa cadeias de pastas-ponte', () => {
    const chain = buildTree({
      rootId: 'R',
      folders: [
        { id: 'R', name: 'R', parentId: null },
        { id: 'P1', name: 'P1', parentId: 'R' },
        { id: 'P2', name: 'P2', parentId: 'P1' },
        { id: 'P3', name: 'P3', parentId: 'P2' },
        { id: 'Q', name: 'Q', parentId: 'R' },
      ],
      files: [
        { id: 'a', name: 'a.mp3', parentId: 'P3', md5: '1', size: 1 },
        { id: 'b', name: 'b.mp3', parentId: 'Q', md5: '2', size: 1 },
      ],
    });
    expect(chain.map((c) => [c.id, c.parentId])).toEqual([['R', null], ['P3', 'R'], ['Q', 'R']]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/sync/tree.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`sync/tree.ts`:
```ts
export interface DriveFolder { id: string; name: string; parentId: string | null }
export interface DriveAudio { id: string; name: string; parentId: string; md5: string; size: number }
export interface DriveSnapshot { rootId: string; folders: DriveFolder[]; files: DriveAudio[]; skipped?: string[] }
export interface TreeCollection { id: string; name: string; parentId: string | null; childIds: string[]; fileIds: string[] }

export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildTree(snap: DriveSnapshot): TreeCollection[] {
  const folders = new Map(snap.folders.map((f) => [f.id, f]));
  const children = new Map<string, string[]>();
  const filesOf = new Map<string, DriveAudio[]>();
  for (const f of snap.folders) if (f.parentId && folders.has(f.parentId)) push(children, f.parentId, f.id);
  for (const a of snap.files) if (folders.has(a.parentId)) push(filesOf, a.parentId, a);

  const out: TreeCollection[] = [];

  // Devolve os ids que representam esta pasta na posição atual ([] se sumiu).
  const visit = (id: string, parentId: string | null): string[] => {
    const folder = folders.get(id)!;
    const files = (filesOf.get(id) ?? []).slice().sort((a, b) => compareNames(a.name, b.name));
    const kids = (children.get(id) ?? []).slice().sort((a, b) => compareNames(folders.get(a)!.name, folders.get(b)!.name));
    const node: TreeCollection = { id, name: folder.name, parentId, childIds: [], fileIds: files.map((f) => f.id) };
    const at = out.length;
    out.push(node);
    for (const k of kids) node.childIds.push(...visit(k, id));

    const isRoot = parentId === null;
    if (isRoot || node.fileIds.length > 0) return [id];
    if (node.childIds.length === 0) {
      out.splice(at, 1);
      return [];
    }
    if (node.childIds.length === 1) {
      out.splice(at, 1);
      const only = out.find((c) => c.id === node.childIds[0])!;
      only.parentId = parentId;
      return [only.id];
    }
    return [id];
  };

  visit(snap.rootId, null);
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/sync/tree.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add sync/tree.ts tests/sync/tree.test.ts
git commit -m "feat(sync): árvore de coleções com colapso e poda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Nomes de arquivo e divisão de zips

**Files:**
- Create: `sync/names.ts`, `sync/zips.ts`
- Test: `tests/sync/names.test.ts`, `tests/sync/zips.test.ts`

**Interfaces:**
- Produces:
```ts
function slugify(s: string): string
function safeAssetName(fileName: string, taken: Set<string>): string   // adiciona o nome a `taken`
function contentTypeFor(name: string): string
function uniqueEntryNames(names: string[]): string[]                    // nomes únicos dentro de um zip
function splitIntoParts<T extends { size: number }>(items: T[], maxBytes: number): T[][]
function zipAssetName(baseName: string, part: number, totalParts: number): string
const MAX_ZIP_BYTES = 1_900_000_000
```

- [ ] **Step 1: Escrever os testes que falham**

`tests/sync/names.test.ts`:
```ts
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
```

`tests/sync/zips.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { splitIntoParts, zipAssetName } from '../../sync/zips';

describe('splitIntoParts', () => {
  it('mantém a ordem e respeita o limite', () => {
    const items = [5, 4, 3, 6, 1].map((size, i) => ({ id: i, size }));
    expect(splitIntoParts(items, 10).map((p) => p.map((x) => x.id))).toEqual([[0, 1], [2, 3, 4]]);
  });
  it('item maior que o limite vai sozinho', () => {
    const items = [{ size: 3 }, { size: 50 }, { size: 3 }];
    expect(splitIntoParts(items, 10).map((p) => p.length)).toEqual([1, 1, 1]);
  });
  it('lista vazia gera zero partes', () => {
    expect(splitIntoParts([], 10)).toEqual([]);
  });
});

describe('zipAssetName', () => {
  it('uma parte não leva sufixo', () => {
    expect(zipAssetName('louvor', 1, 1)).toBe('louvor.zip');
  });
  it('várias partes são numeradas a partir de 1', () => {
    expect(zipAssetName('louvor', 2, 3)).toBe('louvor-parte-2.zip');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/sync/names.test.ts tests/sync/zips.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 3: Implementar**

`sync/names.ts`:
```ts
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function safeAssetName(fileName: string, taken: Set<string>): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : '';
  const base = slugify(dot > 0 ? fileName.slice(0, dot) : fileName).slice(0, 80).replace(/-+$/, '') || 'faixa';
  let name = base + ext;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}${ext}`;
  taken.add(name);
  return name;
}

const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  zip: 'application/zip',
};

export function contentTypeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

export function uniqueEntryNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 1) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
  });
}
```

`sync/zips.ts`:
```ts
export const MAX_ZIP_BYTES = 1_900_000_000;

export function splitIntoParts<T extends { size: number }>(items: T[], maxBytes: number): T[][] {
  const parts: T[][] = [];
  let current: T[] = [];
  let total = 0;
  for (const item of items) {
    if (current.length > 0 && total + item.size > maxBytes) {
      parts.push(current);
      current = [];
      total = 0;
    }
    current.push(item);
    total += item.size;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

export function zipAssetName(baseName: string, part: number, totalParts: number): string {
  return totalParts === 1 ? `${baseName}.zip` : `${baseName}-parte-${part}.zip`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/sync/names.test.ts tests/sync/zips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sync/names.ts sync/zips.ts tests/sync/names.test.ts tests/sync/zips.test.ts
git commit -m "feat(sync): nomes de asset seguros e divisão de zips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Plano de sincronização (diff Drive × catálogo)

**Files:**
- Create: `sync/plan.ts`
- Test: `tests/sync/plan.test.ts`

**Interfaces:**
- Consumes: `DriveSnapshot`, `TreeCollection`, `buildTree` (Task 2); `parseTrackName` (Task 1); `safeAssetName`, `slugify` (Task 3); tipos de `shared/catalog.ts`.
- Produces:
```ts
const PALETTE: string[]
function tagFor(collectionId: string): string                       // `c-${id}`
function assetUrl(repoBase: string, tag: string, name: string): string
function zipKeyFor(md5s: string[]): string                         // sha1 (16 hex) dos md5 ordenados
interface UploadJob { fileId: string; fileName: string; tag: string; assetName: string; url: string; size: number }
interface ZipJob { collectionId: string; tag: string; zipKey: string; baseName: string }
interface SyncPlan { catalog: Catalog; uploads: UploadJob[]; zips: ZipJob[] }
function planSync(snap: DriveSnapshot, tree: TreeCollection[], prev: Catalog | null, repoBase: string, now: string): SyncPlan
function finalizeCatalog(cat: Catalog, notReady: Set<string>): Catalog   // remove faixas cujo url está em notReady e poda coleções vazias
function orphanUrls(prev: Catalog | null, next: Catalog): string[]       // URLs (faixas+zips) de prev que next não usa mais
```

Regras do `planSync`:
- Faixa já existente com mesmo md5 → mantém `url`.
- md5 já enviado (em `prev` ou mais cedo neste plano) → reaproveita o `url`, sem novo envio.
- Senão → novo `UploadJob`; o nome evita todos os nomes já usados por faixas de `prev` naquele release.
- `zipKey` = `zipKeyFor` dos md5 das faixas diretas. Se igual ao de `prev` e `prev` tinha `zipUrls` → mantém; senão gera `ZipJob` (só se houver faixas). Enquanto o job não termina, a coleção carrega `zipUrls`/`zipKey` antigos (ou `[]`/`''` se ficou sem faixas).
- Cor = `PALETTE[índice da coleção na árvore % PALETTE.length]`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/sync/plan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildTree, type DriveSnapshot } from '../../sync/tree';
import { finalizeCatalog, orphanUrls, planSync, PALETTE, zipKeyFor } from '../../sync/plan';

const BASE = 'https://github.com/dono/louvores';
const NOW = '2026-11-10T06:00:00.000Z';

function snapshot(files: DriveSnapshot['files']): DriveSnapshot {
  return {
    rootId: 'R',
    folders: [
      { id: 'R', name: 'Louvores', parentId: null },
      { id: 'A', name: 'Antigas', parentId: 'R' },
      { id: 'B', name: 'Bônus', parentId: 'R' },
    ],
    files,
  };
}

const f1 = { id: 'f1', name: '01 - Cassiane - Hino.mp3', parentId: 'A', md5: 'aaa', size: 10 };
const f2 = { id: 'f2', name: '02 - Hino.mp3', parentId: 'A', md5: 'bbb', size: 20 };
const f3 = { id: 'f3', name: 'Copia.mp3', parentId: 'B', md5: 'aaa', size: 10 };

describe('planSync — primeira execução', () => {
  const snap = snapshot([f1, f2, f3]);
  const plan = planSync(snap, buildTree(snap), null, BASE, NOW);

  it('envia cada md5 uma única vez', () => {
    expect(plan.uploads.map((u) => u.fileId)).toEqual(['f1', 'f2']);
    expect(plan.uploads[0]).toEqual({
      fileId: 'f1',
      fileName: '01 - Cassiane - Hino.mp3',
      tag: 'c-A',
      assetName: '01-cassiane-hino.mp3',
      url: `${BASE}/releases/download/c-A/01-cassiane-hino.mp3`,
      size: 10,
    });
  });
  it('faixa duplicada reaproveita a URL', () => {
    const t3 = plan.catalog.tracks.find((t) => t.id === 'f3')!;
    expect(t3.url).toBe(plan.uploads[0].url);
  });
  it('preenche faixas com título, artista e coleção', () => {
    expect(plan.catalog.tracks.find((t) => t.id === 'f1')).toMatchObject({
      title: 'Hino', artist: 'Cassiane', collectionId: 'A', fileName: '01 - Cassiane - Hino.mp3', md5: 'aaa', size: 10,
    });
  });
  it('gera coleções com cor da paleta e zip pendente', () => {
    expect(plan.catalog.rootId).toBe('R');
    expect(plan.catalog.generatedAt).toBe(NOW);
    expect(plan.catalog.collections.map((c) => [c.id, c.color])).toEqual([['R', PALETTE[0]], ['A', PALETTE[1]], ['B', PALETTE[2]]]);
    expect(plan.zips.map((z) => [z.collectionId, z.baseName, z.tag])).toEqual([['A', 'antigas', 'c-A'], ['B', 'bonus', 'c-B']]);
    expect(plan.catalog.collections.find((c) => c.id === 'A')!.zipUrls).toEqual([]);
  });
});

describe('planSync — execução seguinte', () => {
  const snap1 = snapshot([f1, f2]);
  const first = planSync(snap1, buildTree(snap1), null, BASE, NOW);
  const prev = structuredClone(first.catalog);
  const colA = prev.collections.find((c) => c.id === 'A')!;
  colA.zipUrls = [`${BASE}/releases/download/c-A/antigas.zip`];
  colA.zipKey = zipKeyFor(['aaa', 'bbb']);

  it('nada mudou → nenhum envio e nenhum zip', () => {
    const plan = planSync(snap1, buildTree(snap1), prev, BASE, NOW);
    expect(plan.uploads).toEqual([]);
    expect(plan.zips).toEqual([]);
    expect(plan.catalog.collections.find((c) => c.id === 'A')!.zipUrls).toEqual(colA.zipUrls);
  });
  it('arquivo alterado recebe nome novo e o zip é refeito', () => {
    const snap2 = snapshot([{ ...f1, md5: 'ccc' }, f2]);
    const plan = planSync(snap2, buildTree(snap2), prev, BASE, NOW);
    expect(plan.uploads.map((u) => u.assetName)).toEqual(['01-cassiane-hino-2.mp3']);
    expect(plan.zips.map((z) => z.collectionId)).toEqual(['A']);
    // até o zip novo ficar pronto, o antigo continua no catálogo
    expect(plan.catalog.collections.find((c) => c.id === 'A')!.zipUrls).toEqual(colA.zipUrls);
  });
});

describe('finalizeCatalog', () => {
  const snap = snapshot([f1, f2, { ...f3, md5: 'zzz' }]);
  const plan = planSync(snap, buildTree(snap), null, BASE, NOW);

  it('remove faixas não enviadas e coleções que ficaram vazias', () => {
    const notReady = new Set([plan.uploads.find((u) => u.fileId === 'f3')!.url]);
    const cat = finalizeCatalog(plan.catalog, notReady);
    expect(cat.tracks.map((t) => t.id)).toEqual(['f1', 'f2']);
    expect(cat.collections.map((c) => c.id)).toEqual(['R', 'A']);
    expect(cat.collections.find((c) => c.id === 'R')!.childIds).toEqual(['A']);
  });
  it('sem pendências, mantém tudo', () => {
    const cat = finalizeCatalog(plan.catalog, new Set());
    expect(cat.tracks).toHaveLength(3);
    expect(cat.collections).toHaveLength(3);
  });
});

describe('orphanUrls', () => {
  it('lista URLs de faixas e zips que não são mais usadas', () => {
    const snap = snapshot([f1, f2]);
    const prev = planSync(snap, buildTree(snap), null, BASE, NOW).catalog;
    prev.collections.find((c) => c.id === 'A')!.zipUrls = [`${BASE}/z.zip`];
    const next = structuredClone(prev);
    next.tracks = next.tracks.filter((t) => t.id !== 'f2');
    next.collections.find((c) => c.id === 'A')!.zipUrls = [];
    expect(orphanUrls(prev, next).sort()).toEqual([`${BASE}/releases/download/c-A/02-hino.mp3`, `${BASE}/z.zip`].sort());
  });
  it('sem catálogo anterior não há órfãos', () => {
    const snap = snapshot([f1]);
    expect(orphanUrls(null, planSync(snap, buildTree(snap), null, BASE, NOW).catalog)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/sync/plan.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`sync/plan.ts`:
```ts
import { createHash } from 'node:crypto';
import type { Catalog, Collection, Track } from '../shared/catalog';
import { safeAssetName, slugify } from './names';
import { parseTrackName } from './titles';
import type { DriveSnapshot, TreeCollection } from './tree';

export const PALETTE = ['#1F4E79', '#7A1F3D', '#2E6B3A', '#8A4B0F', '#4B2E83', '#0F6E6E', '#9B2C2C', '#3D4F5C'];

export interface UploadJob { fileId: string; fileName: string; tag: string; assetName: string; url: string; size: number }
export interface ZipJob { collectionId: string; tag: string; zipKey: string; baseName: string }
export interface SyncPlan { catalog: Catalog; uploads: UploadJob[]; zips: ZipJob[] }

export const tagFor = (collectionId: string): string => `c-${collectionId}`;

export const assetUrl = (repoBase: string, tag: string, name: string): string =>
  `${repoBase}/releases/download/${tag}/${encodeURIComponent(name)}`;

export function zipKeyFor(md5s: string[]): string {
  return createHash('sha1').update([...md5s].sort().join(',')).digest('hex').slice(0, 16);
}

export function planSync(
  snap: DriveSnapshot,
  tree: TreeCollection[],
  prev: Catalog | null,
  repoBase: string,
  now: string,
): SyncPlan {
  const files = new Map(snap.files.map((f) => [f.id, f]));
  const prevTracks = new Map((prev?.tracks ?? []).map((t) => [t.id, t]));
  const prevCols = new Map((prev?.collections ?? []).map((c) => [c.id, c]));
  const urlByMd5 = new Map<string, string>();
  for (const t of prev?.tracks ?? []) if (t.url) urlByMd5.set(t.md5, t.url);

  const uploads: UploadJob[] = [];
  const zips: ZipJob[] = [];
  const tracks: Track[] = [];
  const collections: Collection[] = [];

  tree.forEach((tc, i) => {
    const tag = tagFor(tc.id);
    const prefix = `${repoBase}/releases/download/${tag}/`;
    const taken = new Set<string>();
    for (const t of prev?.tracks ?? []) if (t.url.startsWith(prefix)) taken.add(decodeURIComponent(t.url.slice(prefix.length)));

    const trackIds: string[] = [];
    const md5s: string[] = [];
    for (const fid of tc.fileIds) {
      const f = files.get(fid)!;
      const old = prevTracks.get(f.id);
      let url: string;
      if (old && old.md5 === f.md5 && old.url) url = old.url;
      else if (urlByMd5.has(f.md5)) url = urlByMd5.get(f.md5)!;
      else {
        const assetName = safeAssetName(f.name, taken);
        url = assetUrl(repoBase, tag, assetName);
        uploads.push({ fileId: f.id, fileName: f.name, tag, assetName, url, size: f.size });
        urlByMd5.set(f.md5, url);
      }
      const { title, artist } = parseTrackName(f.name);
      tracks.push({ id: f.id, title, artist, fileName: f.name, collectionId: tc.id, md5: f.md5, size: f.size, url });
      trackIds.push(f.id);
      md5s.push(f.md5);
    }

    const zipKey = trackIds.length ? zipKeyFor(md5s) : '';
    const old = prevCols.get(tc.id);
    const keepZip = !!old && old.zipKey === zipKey && old.zipUrls.length > 0;
    if (trackIds.length && !keepZip) zips.push({ collectionId: tc.id, tag, zipKey, baseName: slugify(tc.name) || 'colecao' });

    collections.push({
      id: tc.id,
      name: tc.name,
      parentId: tc.parentId,
      color: PALETTE[i % PALETTE.length],
      childIds: [...tc.childIds],
      trackIds,
      zipUrls: trackIds.length ? [...(old?.zipUrls ?? [])] : [],
      zipKey: trackIds.length ? (old?.zipKey ?? '') : '',
    });
  });

  return { catalog: { generatedAt: now, rootId: snap.rootId, collections, tracks }, uploads, zips };
}

export function finalizeCatalog(cat: Catalog, notReady: Set<string>): Catalog {
  const tracks = cat.tracks.filter((t) => !notReady.has(t.url));
  const ready = new Set(tracks.map((t) => t.id));
  const cols = new Map(cat.collections.map((c) => [c.id, { ...c, trackIds: c.trackIds.filter((id) => ready.has(id)) }]));
  const memo = new Map<string, number>();
  const total = (id: string): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const c = cols.get(id)!;
    const n = c.trackIds.length + c.childIds.reduce((s, k) => s + (cols.has(k) ? total(k) : 0), 0);
    memo.set(id, n);
    return n;
  };
  const keep = new Set([...cols.keys()].filter((id) => id === cat.rootId || total(id) > 0));
  const collections = [...cols.values()]
    .filter((c) => keep.has(c.id))
    .map((c) => ({
      ...c,
      childIds: c.childIds.filter((k) => keep.has(k)),
      zipUrls: c.trackIds.length ? c.zipUrls : [],
      zipKey: c.trackIds.length ? c.zipKey : '',
    }));
  return { ...cat, collections, tracks };
}

function allUrls(cat: Catalog): Set<string> {
  const urls = new Set<string>();
  for (const t of cat.tracks) urls.add(t.url);
  for (const c of cat.collections) for (const u of c.zipUrls) urls.add(u);
  return urls;
}

export function orphanUrls(prev: Catalog | null, next: Catalog): string[] {
  if (!prev) return [];
  const used = allUrls(next);
  return [...allUrls(prev)].filter((u) => !used.has(u));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/sync/plan.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add sync/plan.ts tests/sync/plan.test.ts
git commit -m "feat(sync): plano de envio, finalização e órfãos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Adaptadores externos (Drive, GitHub Releases, zip)

Camada fina de I/O sem testes unitários (depende de rede e credenciais). Verificação: `tsc` limpo. O teste real acontece na Task 13.

**Files:**
- Create: `sync/drive.ts`, `sync/github.ts`, `sync/zipper.ts`

**Interfaces:**
- Consumes: `DriveSnapshot`, `DriveFolder`, `DriveAudio` (Task 2); `isAudioFile` (Task 1).
- Produces:
```ts
// drive.ts
function createDrive(saJson: string): drive_v3.Drive
function snapshotDrive(drive: drive_v3.Drive, rootId: string): Promise<DriveSnapshot>
function downloadToFile(drive: drive_v3.Drive, fileId: string, dest: string): Promise<void>
// github.ts
interface ReleaseAsset { id: number; name: string; size: number }
interface Release { id: number; tag: string; assets: Map<string, ReleaseAsset> }
class Releases {
  constructor(token: string, repo: string)            // repo = "owner/name"
  readonly repoBase: string                            // https://github.com/owner/name
  ensure(tag: string, title: string): Promise<Release>
  get(tag: string): Promise<Release | null>
  hasSameSize(rel: Release, name: string, size: number): boolean
  upload(rel: Release, name: string, path: string, contentType: string, opts?: { force?: boolean }): Promise<void>
  deleteAsset(rel: Release, name: string): Promise<void>
  deleteByUrl(url: string): Promise<void>
}
// zipper.ts
interface ZipEntry { name: string; url: string }
function buildZip(entries: ZipEntry[], dest: string): Promise<void>
```

- [ ] **Step 1: Implementar `sync/drive.ts`**

```ts
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { google, type drive_v3 } from 'googleapis';
import { isAudioFile } from './titles';
import type { DriveAudio, DriveFolder, DriveSnapshot } from './tree';

const FOLDER = 'application/vnd.google-apps.folder';

export function createDrive(saJson: string): drive_v3.Drive {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(saJson),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function snapshotDrive(drive: drive_v3.Drive, rootId: string): Promise<DriveSnapshot> {
  const root = await drive.files.get({ fileId: rootId, fields: 'id,name', supportsAllDrives: true });
  const folders: DriveFolder[] = [{ id: rootId, name: root.data.name ?? 'Louvores', parentId: null }];
  const files: DriveAudio[] = [];
  const skipped: string[] = [];
  const queue = [rootId];

  while (queue.length) {
    const parent = queue.shift()!;
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${parent}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,md5Checksum,size)',
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) {
        if (!f.id || !f.name) continue;
        if (f.mimeType === FOLDER) {
          folders.push({ id: f.id, name: f.name, parentId: parent });
          queue.push(f.id);
        } else if (isAudioFile(f.name) && f.md5Checksum) {
          files.push({ id: f.id, name: f.name, parentId: parent, md5: f.md5Checksum, size: Number(f.size ?? 0) });
        } else {
          skipped.push(f.name);
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return { rootId, folders, files, skipped };
}

export async function downloadToFile(drive: drive_v3.Drive, fileId: string, dest: string): Promise<void> {
  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  await pipeline(res.data as NodeJS.ReadableStream, createWriteStream(dest));
}
```

- [ ] **Step 2: Implementar `sync/github.ts`**

```ts
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
```

- [ ] **Step 3: Implementar `sync/zipper.ts`**

```ts
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export interface ZipEntry { name: string; url: string }

// Baixa as faixas uma de cada vez (nunca em paralelo) e grava um zip sem compressão.
export async function buildZip(entries: ZipEntry[], dest: string): Promise<void> {
  const out = createWriteStream(dest);
  const zip = archiver('zip', { store: true });
  const closed = new Promise<void>((resolve, reject) => {
    out.on('close', () => resolve());
    out.on('error', reject);
    zip.on('error', reject);
  });
  zip.pipe(out);
  for (const e of entries) {
    const res = await fetch(e.url);
    if (!res.ok || !res.body) throw new Error(`baixar para zip ${e.url}: HTTP ${res.status}`);
    await new Promise<void>((resolve) => {
      zip.once('entry', () => resolve());
      zip.append(Readable.fromWeb(res.body as unknown as WebReadableStream), { name: e.name });
    });
  }
  await zip.finalize();
  await closed;
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add sync/drive.ts sync/github.ts sync/zipper.ts
git commit -m "feat(sync): adaptadores do Drive, GitHub Releases e zip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ciclo de sincronização + workflow do GitHub Actions

**Files:**
- Create: `sync/main.ts`, `.github/workflows/site.yml`

**Interfaces:**
- Consumes: tudo de Tasks 1–5.
- Produces: comando `npm run sync` (variáveis: `GDRIVE_SA_JSON`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, opcionais `ROOT_FOLDER_ID`, `CATALOG_PATH`, `TIME_BUDGET_MIN`), que reescreve `web/public/catalog.json`.

- [ ] **Step 1: Implementar `sync/main.ts`**

```ts
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Catalog, Track } from '../shared/catalog';
import { createDrive, downloadToFile, snapshotDrive } from './drive';
import { Releases } from './github';
import { contentTypeFor, uniqueEntryNames } from './names';
import { assetUrl, finalizeCatalog, orphanUrls, planSync } from './plan';
import { buildTree } from './tree';
import { buildZip } from './zipper';
import { MAX_ZIP_BYTES, splitIntoParts, zipAssetName } from './zips';

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Variável de ambiente ${key} não definida`);
  return v;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function main(): Promise<void> {
  const started = Date.now();
  const budgetMs = Number(env('TIME_BUDGET_MIN', '300')) * 60_000;
  const outOfTime = () => Date.now() - started > budgetMs;
  const catalogPath = env('CATALOG_PATH', 'web/public/catalog.json');

  const prevRaw = existsSync(catalogPath) ? (JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog) : null;
  const prev = prevRaw && !prevRaw.sample ? prevRaw : null;

  const drive = createDrive(env('GDRIVE_SA_JSON'));
  const gh = new Releases(env('GITHUB_TOKEN'), env('GITHUB_REPOSITORY'));

  const snap = await snapshotDrive(drive, env('ROOT_FOLDER_ID', '1ak8DwNK4UeRQmKLpKhEao-XdyEj0Z8EC'));
  const tree = buildTree(snap);
  const plan = planSync(snap, tree, prev, gh.repoBase, new Date().toISOString());
  const nameOf = new Map(tree.map((c) => [`c-${c.id}`, c.name]));
  const tmp = mkdtempSync(join(tmpdir(), 'louvores-'));

  const notReady = new Set<string>();
  const failures: string[] = [];
  let uploaded = 0;

  for (const job of plan.uploads) {
    if (outOfTime()) {
      notReady.add(job.url);
      continue;
    }
    const file = join(tmp, job.assetName);
    try {
      const rel = await gh.ensure(job.tag, nameOf.get(job.tag) ?? job.tag);
      if (!gh.hasSameSize(rel, job.assetName, job.size)) {
        await downloadToFile(drive, job.fileId, file);
        await gh.upload(rel, job.assetName, file, contentTypeFor(job.assetName));
      }
      uploaded++;
    } catch (e) {
      notReady.add(job.url);
      failures.push(`${job.fileName}: ${errMsg(e)}`);
    } finally {
      rmSync(file, { force: true });
    }
  }

  const catalog = finalizeCatalog(plan.catalog, notReady);
  const trackById = new Map(catalog.tracks.map((t) => [t.id, t]));
  const plannedCount = new Map(plan.catalog.collections.map((c) => [c.id, c.trackIds.length]));
  const replacedZips: string[] = [];

  for (const z of plan.zips) {
    if (outOfTime()) break;
    const col = catalog.collections.find((c) => c.id === z.collectionId);
    if (!col || col.trackIds.length === 0 || col.trackIds.length !== plannedCount.get(z.collectionId)) continue;
    const tracks: Track[] = col.trackIds.map((id) => trackById.get(id)!);
    const names = uniqueEntryNames(tracks.map((t) => t.fileName));
    const entries = tracks.map((t, i) => ({ name: names[i], url: t.url, size: t.size }));
    const parts = splitIntoParts(entries, MAX_ZIP_BYTES);
    try {
      const rel = await gh.ensure(z.tag, col.name);
      const urls: string[] = [];
      for (let p = 0; p < parts.length; p++) {
        const name = zipAssetName(z.baseName, p + 1, parts.length);
        const file = join(tmp, name);
        try {
          await buildZip(parts[p], file);
          await gh.upload(rel, name, file, 'application/zip', { force: true });
          urls.push(assetUrl(gh.repoBase, z.tag, name));
        } finally {
          rmSync(file, { force: true });
        }
      }
      replacedZips.push(...col.zipUrls.filter((u) => !urls.includes(u)));
      col.zipUrls = urls;
      col.zipKey = z.zipKey;
    } catch (e) {
      failures.push(`zip ${col.name}: ${errMsg(e)}`);
    }
  }

  let deleted = 0;
  for (const url of [...orphanUrls(prev, catalog), ...replacedZips]) {
    if (outOfTime()) break;
    try {
      await gh.deleteByUrl(url);
      deleted++;
    } catch (e) {
      failures.push(`apagar ${url}: ${errMsg(e)}`);
    }
  }

  if (prev) {
    const strip = (c: Catalog) => JSON.stringify({ ...c, generatedAt: '' });
    if (strip(prev) === strip(catalog)) catalog.generatedAt = prev.generatedAt;
  }
  writeFileSync(catalogPath, JSON.stringify(catalog));
  rmSync(tmp, { recursive: true, force: true });

  const summary = [
    '## Sincronização dos louvores',
    `- Faixas no site: ${catalog.tracks.length}`,
    `- Coleções: ${catalog.collections.length}`,
    `- Enviadas agora: ${uploaded}`,
    `- Pendentes para o próximo ciclo: ${notReady.size}`,
    `- Arquivos apagados: ${deleted}`,
    `- Arquivos ignorados (não são áudio): ${snap.skipped?.length ?? 0}`,
    `- Falhas: ${failures.length}`,
    ...failures.slice(0, 50).map((f) => `  - ${f}`),
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Criar `.github/workflows/site.yml`**

```yaml
name: Site

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: site
  cancel-in-progress: false

jobs:
  sync:
    if: github.event_name != 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 340
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run sync
        env:
          GDRIVE_SA_JSON: ${{ secrets.GDRIVE_SA_JSON }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TIME_BUDGET_MIN: '300'
      - name: Gravar catálogo
        run: |
          if git diff --quiet -- web/public/catalog.json; then
            echo "Catálogo sem mudanças."
          else
            git config user.name "louvores-bot"
            git config user.email "louvores-bot@users.noreply.github.com"
            git add web/public/catalog.json
            git commit -m "chore: atualiza catálogo"
            git push
          fi

  deploy:
    needs: sync
    if: ${{ !cancelled() && (needs.sync.result == 'success' || needs.sync.result == 'skipped') }}
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verificar tipos e testes**

Run: `npx tsc && npx vitest run`
Expected: sem erros de tipo; todos os testes passam.

- [ ] **Step 4: Verificar falha amigável sem credenciais**

Run: `npx tsx sync/main.ts`
Expected: sai com código 1 e a mensagem `Variável de ambiente GDRIVE_SA_JSON não definida`.

- [ ] **Step 5: Commit**

```bash
git add sync/main.ts .github/workflows/site.yml
git commit -m "feat(sync): ciclo completo e workflow de sync + deploy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Lógica básica do site (formatação, rotas, busca, armazenamento)

**Files:**
- Create: `web/src/format.ts`, `web/src/router.ts`, `web/src/search.ts`, `web/src/storage.ts`
- Test: `tests/web/basics.test.ts`

**Interfaces:**
- Produces:
```ts
function countLabel(n: number): string          // "1 música" | "N músicas"
function formatTime(sec: number): string        // "m:ss"
type Route = { name: 'home' } | { name: 'collection'; id: string } | { name: 'search'; q: string }
function parseHash(hash: string): Route
function hrefFor(r: Route): string               // '#/', '#/c/<id>', '#/busca?q=<q>'
function normalize(s: string): string
function searchTracks(tracks: Track[], query: string, limit?: number): Track[]   // todas as palavras; sem duplicar md5
function safeGet<T>(key: string): T | null
function safeSet(key: string, value: unknown): void
```

- [ ] **Step 1: Escrever o teste que falha**

`tests/web/basics.test.ts`:
```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../shared/catalog';
import { countLabel, formatTime } from '../../web/src/format';
import { hrefFor, parseHash } from '../../web/src/router';
import { normalize, searchTracks } from '../../web/src/search';
import { safeGet, safeSet } from '../../web/src/storage';

const track = (id: string, title: string, artist = '', md5 = id): Track => ({
  id, title, artist, md5, fileName: `${title}.mp3`, collectionId: 'c', size: 1, url: `u/${id}`,
});

describe('format', () => {
  it('countLabel', () => {
    expect(countLabel(1)).toBe('1 música');
    expect(countLabel(0)).toBe('0 músicas');
    expect(countLabel(12)).toBe('12 músicas');
  });
  it('formatTime', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(3725)).toBe('62:05');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});

describe('router', () => {
  it('ida e volta', () => {
    for (const r of [{ name: 'home' }, { name: 'collection', id: '1a-B_c' }, { name: 'search', q: 'hino da vitória' }] as const) {
      expect(parseHash(hrefFor(r))).toEqual(r);
    }
  });
  it('hash desconhecido ou vazio vai para o início', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/qualquer')).toEqual({ name: 'home' });
  });
});

describe('search', () => {
  const tracks = [
    track('1', 'Hino da Vitória', 'Cassiane'),
    track('2', 'Com Muito Louvor', 'Cassiane'),
    track('3', 'Hino da Vitória', 'Cassiane', '1'), // mesmo md5 do 1
    track('4', 'Consagração', 'Aline Barros'),
  ];
  it('normalize remove acentos, caixa e espaços extras', () => {
    expect(normalize('  Consagração  AO   Rei ')).toBe('consagracao ao rei');
  });
  it('exige todas as palavras, em título ou artista, sem acento', () => {
    expect(searchTracks(tracks, 'vitoria cassiane').map((t) => t.id)).toEqual(['1']);
    expect(searchTracks(tracks, 'aline').map((t) => t.id)).toEqual(['4']);
  });
  it('não repete o mesmo áudio', () => {
    expect(searchTracks(tracks, 'hino').map((t) => t.id)).toEqual(['1']);
  });
  it('busca vazia não retorna nada', () => {
    expect(searchTracks(tracks, '   ')).toEqual([]);
  });
});

describe('storage', () => {
  afterEach(() => vi.restoreAllMocks());
  it('grava e lê JSON', () => {
    safeSet('k', { a: 1 });
    expect(safeGet('k')).toEqual({ a: 1 });
  });
  it('não quebra quando o armazenamento falha', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(() => safeSet('k', 1)).not.toThrow();
    expect(safeGet('k')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/web/basics.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 3: Implementar**

`web/src/format.ts`:
```ts
export const countLabel = (n: number): string => (n === 1 ? '1 música' : `${n} músicas`);

export function formatTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
```

`web/src/router.ts`:
```ts
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
```

`web/src/search.ts`:
```ts
import type { Track } from '../../shared/catalog';

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function searchTracks(tracks: Track[], query: string, limit = 200): Track[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (seen.has(t.md5)) continue;
    const hay = normalize(`${t.title} ${t.artist} ${t.fileName}`);
    if (words.every((w) => hay.includes(w))) {
      seen.add(t.md5);
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}
```

`web/src/storage.ts`:
```ts
export function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado ou armazenamento bloqueado: segue sem lembrar */
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/web/basics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src tests/web/basics.test.ts
git commit -m "feat(web): formatação, rotas, busca e armazenamento seguro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Índice do catálogo e modos de download

**Files:**
- Create: `web/src/catalogIndex.ts`, `web/src/downloads.ts`
- Test: `tests/web/catalogIndex.test.ts`, `tests/web/downloads.test.ts`

**Interfaces:**
- Consumes: tipos de `shared/catalog.ts`.
- Produces:
```ts
interface HomeSection { title: string; collections: Collection[] }
class CatalogIndex {
  constructor(data: Catalog)
  readonly data: Catalog
  get root(): Collection
  collection(id: string): Collection | undefined
  track(id: string): Track | undefined
  tracksOf(id: string): Track[]
  childrenOf(id: string): Collection[]
  totalTracks(id: string): number                 // recursivo
  homeSections(): HomeSection[]
  backTarget(id: string): string | null           // id da coleção-pai, ou null = início
}
function loadCatalog(fetchFn?: typeof fetch, url?: string): Promise<Catalog>
type Platform = 'ios' | 'android' | 'desktop'
type CollectionDownloadMode = 'zip' | 'sequential' | 'none'
function detectPlatform(ua: string, maxTouchPoints: number): Platform
function collectionDownloadMode(p: Platform, hasZip: boolean): CollectionDownloadMode
function downloadSequential(urls: string[], onProgress: (done: number, total: number) => void,
  opts?: { delayMs?: number; click?: (url: string) => void; wait?: (ms: number) => Promise<void> }): Promise<void>
```

Regras de `homeSections`: cada filha da raiz com filhas vira seção (título = nome, capas = filhas dela). Filhas da raiz com faixas diretas (e a própria raiz, se tiver faixas) vão para a seção final "Outras".
Regras de `backTarget`: sem pai, pai = raiz, ou pai = filha da raiz sem faixas diretas (é só um título de seção) → `null`. Senão, o id do pai.

- [ ] **Step 1: Escrever os testes que falham**

`tests/web/catalogIndex.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { Catalog, Collection, Track } from '../../shared/catalog';
import { CatalogIndex, loadCatalog } from '../../web/src/catalogIndex';

const col = (id: string, parentId: string | null, childIds: string[], trackIds: string[]): Collection => ({
  id, name: id.toUpperCase(), parentId, color: '#000', childIds, trackIds, zipUrls: [], zipKey: '',
});
const tr = (id: string, collectionId: string): Track => ({
  id, title: id, artist: '', fileName: `${id}.mp3`, collectionId, md5: id, size: 1, url: id,
});

// R ─ S (seção, sem faixas) ─ A (2 faixas) ─ A1 (1 faixa)
//   │                       └ B (1 faixa)
//   └ O (1 faixa, folha) 
const data: Catalog = {
  generatedAt: '', rootId: 'R',
  collections: [
    col('R', null, ['S', 'O'], []),
    col('S', 'R', ['A', 'B'], []),
    col('A', 'S', ['A1'], ['t1', 't2']),
    col('A1', 'A', [], ['t3']),
    col('B', 'S', [], ['t4']),
    col('O', 'R', [], ['t5']),
  ],
  tracks: [tr('t1', 'A'), tr('t2', 'A'), tr('t3', 'A1'), tr('t4', 'B'), tr('t5', 'O')],
};
const idx = new CatalogIndex(data);

describe('CatalogIndex', () => {
  it('acessa raiz, coleções e faixas', () => {
    expect(idx.root.id).toBe('R');
    expect(idx.collection('A')!.name).toBe('A');
    expect(idx.track('t3')!.collectionId).toBe('A1');
    expect(idx.tracksOf('A').map((t) => t.id)).toEqual(['t1', 't2']);
    expect(idx.childrenOf('S').map((c) => c.id)).toEqual(['A', 'B']);
    expect(idx.collection('nada')).toBeUndefined();
  });
  it('conta faixas recursivamente', () => {
    expect(idx.totalTracks('A')).toBe(3);
    expect(idx.totalTracks('R')).toBe(5);
  });
  it('monta seções do início', () => {
    expect(idx.homeSections().map((s) => [s.title, s.collections.map((c) => c.id)])).toEqual([
      ['S', ['A', 'B']],
      ['Outras', ['O']],
    ]);
  });
  it('define para onde o botão Voltar leva', () => {
    expect(idx.backTarget('A')).toBeNull();   // pai é título de seção
    expect(idx.backTarget('O')).toBeNull();   // pai é a raiz
    expect(idx.backTarget('A1')).toBe('A');
  });
});

describe('loadCatalog', () => {
  it('lê o JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
    await expect(loadCatalog(fetchFn, './catalog.json')).resolves.toEqual(data);
    expect(fetchFn).toHaveBeenCalledWith('./catalog.json', { cache: 'no-cache' });
  });
  it('falha com status de erro', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('x', { status: 500 }));
    await expect(loadCatalog(fetchFn)).rejects.toThrow('HTTP 500');
  });
});
```

`tests/web/downloads.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { collectionDownloadMode, detectPlatform, downloadSequential } from '../../web/src/downloads';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
};

describe('detectPlatform', () => {
  it('reconhece iPhone e iPad (que se apresenta como Mac com toque)', () => {
    expect(detectPlatform(UA.iphone, 5)).toBe('ios');
    expect(detectPlatform(UA.ipadOS, 5)).toBe('ios');
  });
  it('Mac sem toque é computador', () => {
    expect(detectPlatform(UA.ipadOS, 0)).toBe('desktop');
  });
  it('Android e Windows', () => {
    expect(detectPlatform(UA.android, 5)).toBe('android');
    expect(detectPlatform(UA.windows, 0)).toBe('desktop');
  });
});

describe('collectionDownloadMode', () => {
  it('computador usa zip quando existe', () => {
    expect(collectionDownloadMode('desktop', true)).toBe('zip');
    expect(collectionDownloadMode('desktop', false)).toBe('sequential');
  });
  it('Android baixa em sequência; iPhone não oferece', () => {
    expect(collectionDownloadMode('android', true)).toBe('sequential');
    expect(collectionDownloadMode('ios', true)).toBe('none');
  });
});

describe('downloadSequential', () => {
  it('clica cada URL em ordem, esperando entre elas, e informa o progresso', async () => {
    const click = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);
    const progress: [number, number][] = [];
    await downloadSequential(['a', 'b', 'c'], (d, n) => progress.push([d, n]), { click, wait, delayMs: 1500 });
    expect(click.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1500);
    expect(progress).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/web/catalogIndex.test.ts tests/web/downloads.test.ts`
Expected: FAIL — imports não resolvidos.

- [ ] **Step 3: Implementar**

`web/src/catalogIndex.ts`:
```ts
import type { Catalog, Collection, Track } from '../../shared/catalog';

export interface HomeSection { title: string; collections: Collection[] }

export class CatalogIndex {
  private cols: Map<string, Collection>;
  private trks: Map<string, Track>;
  private totals = new Map<string, number>();

  constructor(readonly data: Catalog) {
    this.cols = new Map(data.collections.map((c) => [c.id, c]));
    this.trks = new Map(data.tracks.map((t) => [t.id, t]));
  }

  get root(): Collection {
    return this.cols.get(this.data.rootId)!;
  }

  collection(id: string): Collection | undefined {
    return this.cols.get(id);
  }

  track(id: string): Track | undefined {
    return this.trks.get(id);
  }

  tracksOf(id: string): Track[] {
    return (this.cols.get(id)?.trackIds ?? []).map((t) => this.trks.get(t)).filter((t): t is Track => !!t);
  }

  childrenOf(id: string): Collection[] {
    return (this.cols.get(id)?.childIds ?? []).map((c) => this.cols.get(c)).filter((c): c is Collection => !!c);
  }

  totalTracks(id: string): number {
    const hit = this.totals.get(id);
    if (hit !== undefined) return hit;
    const c = this.cols.get(id);
    const n = c ? c.trackIds.length + c.childIds.reduce((s, k) => s + this.totalTracks(k), 0) : 0;
    this.totals.set(id, n);
    return n;
  }

  homeSections(): HomeSection[] {
    const sections: HomeSection[] = [];
    const others: Collection[] = [];
    if (this.root.trackIds.length) others.push(this.root);
    for (const c of this.childrenOf(this.root.id)) {
      if (c.childIds.length) sections.push({ title: c.name, collections: this.childrenOf(c.id) });
      if (c.trackIds.length) others.push(c);
    }
    if (others.length) sections.push({ title: 'Outras', collections: others });
    return sections;
  }

  backTarget(id: string): string | null {
    const c = this.cols.get(id);
    const p = c?.parentId ? this.cols.get(c.parentId) : undefined;
    if (!p || p.id === this.data.rootId) return null;
    if (p.parentId === this.data.rootId && p.trackIds.length === 0) return null;
    return p.id;
  }
}

export async function loadCatalog(fetchFn: typeof fetch = fetch, url = './catalog.json'): Promise<Catalog> {
  const res = await fetchFn(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Catalog;
}
```

`web/src/downloads.ts`:
```ts
export type Platform = 'ios' | 'android' | 'desktop';
export type CollectionDownloadMode = 'zip' | 'sequential' | 'none';

export function detectPlatform(ua: string, maxTouchPoints: number): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function collectionDownloadMode(p: Platform, hasZip: boolean): CollectionDownloadMode {
  if (p === 'ios') return 'none';
  if (p === 'android') return 'sequential';
  return hasZip ? 'zip' : 'sequential';
}

function clickDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function downloadSequential(
  urls: string[],
  onProgress: (done: number, total: number) => void,
  opts: { delayMs?: number; click?: (url: string) => void; wait?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const { delayMs = 1500, click = clickDownload, wait = sleep } = opts;
  for (let i = 0; i < urls.length; i++) {
    onProgress(i, urls.length);
    if (i > 0) await wait(delayMs);
    click(urls[i]);
  }
  onProgress(urls.length, urls.length);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/web/catalogIndex.test.ts tests/web/downloads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/catalogIndex.ts web/src/downloads.ts tests/web/catalogIndex.test.ts tests/web/downloads.test.ts
git commit -m "feat(web): índice do catálogo e modos de download

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Player de áudio

**Files:**
- Create: `web/src/player.ts`
- Test: `tests/web/player.test.ts`

**Interfaces:**
- Consumes: `Track`; `safeGet`, `safeSet` (Task 7).
- Produces:
```ts
interface PlayerState { queue: Track[]; index: number; current: Track | null; playing: boolean; currentTime: number; duration: number; error: string | null }
interface AudioLike extends EventTarget { src: string; currentTime: number; duration: number; paused: boolean; play(): Promise<void>; pause(): void }
class Player {
  constructor(audio: AudioLike, opts?: { skipDelayMs?: number })
  getState(): PlayerState
  subscribe(fn: (s: PlayerState) => void): () => void   // chama fn imediatamente
  playQueue(tracks: Track[], start?: number): void
  toggle(): void
  next(): void
  prev(): void
  seek(seconds: number): void
  restore(lookup: (id: string) => Track | undefined): void   // carrega pausado
}
const PLAYER_KEY = 'louvores.player'   // { ids: string[]; currentId: string; time: number }
```

Comportamento: ao terminar, toca a próxima; na última, para. `prev()` com mais de 3 s volta ao início da faixa. Erro → `error = 'Não foi possível tocar esta música'` e, após `skipDelayMs` (padrão 3000), pula para a próxima se o usuário não trocou de faixa. Salva o estado ao trocar de faixa e a cada 5 s de reprodução. Media Session: metadados + ações play/pause/anterior/próxima/seekto quando disponíveis.

- [ ] **Step 1: Escrever o teste que falha**

`tests/web/player.test.ts`:
```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../shared/catalog';
import { PLAYER_KEY, Player, type AudioLike } from '../../web/src/player';

class FakeAudio extends EventTarget implements AudioLike {
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  async play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

const tr = (id: string): Track => ({
  id, title: `Título ${id}`, artist: 'Artista', fileName: `${id}.mp3`, collectionId: 'c', md5: id, size: 1, url: `https://x/${id}.mp3`,
});
const queue = [tr('a'), tr('b'), tr('c')];

let audio: FakeAudio;
let player: Player;
beforeEach(() => {
  localStorage.clear();
  audio = new FakeAudio();
  player = new Player(audio, { skipDelayMs: 3000 });
});
afterEach(() => vi.useRealTimers());

describe('Player', () => {
  it('toca a fila a partir do índice pedido', async () => {
    player.playQueue(queue, 1);
    await Promise.resolve();
    expect(audio.src).toBe('https://x/b.mp3');
    expect(player.getState()).toMatchObject({ index: 1, playing: true, current: { id: 'b' } });
  });

  it('avisa assinantes imediatamente e a cada mudança', () => {
    const seen: (string | undefined)[] = [];
    player.subscribe((s) => seen.push(s.current?.id));
    player.playQueue(queue, 0);
    expect(seen[0]).toBeUndefined();
    expect(seen).toContain('a');
  });

  it('ao terminar toca a próxima e para na última', async () => {
    player.playQueue(queue, 1);
    audio.fire('ended');
    expect(player.getState().current!.id).toBe('c');
    audio.fire('ended');
    await Promise.resolve();
    expect(player.getState().current!.id).toBe('c');
    expect(audio.paused).toBe(true);
  });

  it('anterior: volta ao início se passou de 3 s, senão vai à faixa anterior', () => {
    player.playQueue(queue, 1);
    audio.currentTime = 10;
    player.prev();
    expect(audio.currentTime).toBe(0);
    expect(player.getState().index).toBe(1);
    player.prev();
    expect(player.getState().index).toBe(0);
  });

  it('toggle pausa e retoma', async () => {
    player.playQueue(queue, 0);
    await Promise.resolve();
    player.toggle();
    expect(player.getState().playing).toBe(false);
    player.toggle();
    await Promise.resolve();
    expect(player.getState().playing).toBe(true);
  });

  it('erro mostra aviso e pula após o atraso', () => {
    vi.useFakeTimers();
    player.playQueue(queue, 0);
    audio.fire('error');
    expect(player.getState().error).toBe('Não foi possível tocar esta música');
    vi.advanceTimersByTime(3000);
    expect(player.getState().current!.id).toBe('b');
    expect(player.getState().error).toBeNull();
  });

  it('erro não pula se o usuário já trocou de faixa', () => {
    vi.useFakeTimers();
    player.playQueue(queue, 0);
    audio.fire('error');
    player.playQueue(queue, 2);
    vi.advanceTimersByTime(3000);
    expect(player.getState().current!.id).toBe('c');
  });

  it('lembra a fila e restaura pausado', () => {
    player.playQueue(queue, 2);
    const saved = JSON.parse(localStorage.getItem(PLAYER_KEY)!);
    expect(saved).toEqual({ ids: ['a', 'b', 'c'], currentId: 'c', time: 0 });

    localStorage.setItem(PLAYER_KEY, JSON.stringify({ ids: ['a', 'x', 'c'], currentId: 'c', time: 42 }));
    const audio2 = new FakeAudio();
    const p2 = new Player(audio2);
    p2.restore((id) => queue.find((t) => t.id === id));
    expect(p2.getState()).toMatchObject({ index: 1, playing: false, currentTime: 42, current: { id: 'c' } });
    expect(p2.getState().queue.map((t) => t.id)).toEqual(['a', 'c']);
    audio2.fire('loadedmetadata');
    expect(audio2.currentTime).toBe(42);
  });

  it('restore ignora estado salvo inválido', () => {
    localStorage.setItem(PLAYER_KEY, JSON.stringify({ ids: ['x'], currentId: 'x', time: 1 }));
    player.restore(() => undefined);
    expect(player.getState().current).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/web/player.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`web/src/player.ts`:
```ts
import type { Track } from '../../shared/catalog';
import { safeGet, safeSet } from './storage';

export interface PlayerState {
  queue: Track[];
  index: number;
  current: Track | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
}

export interface AudioLike extends EventTarget {
  src: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

interface Saved { ids: string[]; currentId: string; time: number }

export const PLAYER_KEY = 'louvores.player';
const ERROR_TEXT = 'Não foi possível tocar esta música';

export class Player {
  private state: PlayerState = { queue: [], index: -1, current: null, playing: false, currentTime: 0, duration: 0, error: null };
  private listeners = new Set<(s: PlayerState) => void>();
  private pendingSeek: number | null = null;
  private lastSave = 0;

  constructor(private audio: AudioLike, private opts: { skipDelayMs?: number } = {}) {
    audio.addEventListener('timeupdate', () => {
      this.patch({ currentTime: audio.currentTime });
      if (Date.now() - this.lastSave > 5000) this.save(audio.currentTime);
    });
    audio.addEventListener('durationchange', () => {
      this.patch({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    });
    audio.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek !== null) {
        audio.currentTime = this.pendingSeek;
        this.pendingSeek = null;
      }
    });
    audio.addEventListener('play', () => this.patch({ playing: true, error: null }));
    audio.addEventListener('pause', () => this.patch({ playing: false }));
    audio.addEventListener('ended', () => this.next());
    audio.addEventListener('error', () => {
      const at = this.state.index;
      this.patch({ playing: false, error: ERROR_TEXT });
      setTimeout(() => {
        if (this.state.index === at && this.state.error) this.next();
      }, this.opts.skipDelayMs ?? 3000);
    });
    this.setupMediaSession();
  }

  getState(): PlayerState {
    return this.state;
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  playQueue(tracks: Track[], start = 0): void {
    this.patch({ queue: tracks });
    this.load(start, true);
  }

  toggle(): void {
    if (!this.state.current) return;
    if (this.audio.paused) void this.safePlay();
    else this.audio.pause();
  }

  next(): void {
    if (this.state.index < this.state.queue.length - 1) this.load(this.state.index + 1, true);
    else this.audio.pause();
  }

  prev(): void {
    if (this.audio.currentTime > 3 || this.state.index <= 0) {
      this.seek(0);
      return;
    }
    this.load(this.state.index - 1, true);
  }

  seek(seconds: number): void {
    this.audio.currentTime = Math.max(0, seconds);
    this.patch({ currentTime: this.audio.currentTime });
  }

  restore(lookup: (id: string) => Track | undefined): void {
    const saved = safeGet<Saved>(PLAYER_KEY);
    if (!saved || !Array.isArray(saved.ids)) return;
    const queue = saved.ids.map(lookup).filter((t): t is Track => !!t);
    if (!queue.length) return;
    const found = queue.findIndex((t) => t.id === saved.currentId);
    this.patch({ queue });
    this.load(found >= 0 ? found : 0, false, found >= 0 ? Number(saved.time) || 0 : 0);
  }

  private load(i: number, autoplay: boolean, startAt = 0): void {
    const t = this.state.queue[i];
    if (!t) return;
    this.audio.src = t.url;
    this.pendingSeek = startAt > 0 ? startAt : null;
    this.patch({ index: i, current: t, currentTime: startAt, duration: 0, error: null });
    this.updateMetadata(t);
    this.save(startAt);
    if (autoplay) void this.safePlay();
  }

  private async safePlay(): Promise<void> {
    try {
      await this.audio.play();
    } catch {
      this.patch({ playing: false });
    }
  }

  private save(time: number): void {
    if (!this.state.current) return;
    safeSet(PLAYER_KEY, { ids: this.state.queue.map((t) => t.id), currentId: this.state.current.id, time: Math.floor(time) });
    this.lastSave = Date.now();
  }

  private patch(p: Partial<PlayerState>): void {
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn(this.state);
  }

  private setupMediaSession(): void {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* ação não suportada neste navegador */
      }
    };
    set('play', () => void this.safePlay());
    set('pause', () => this.audio.pause());
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    set('seekto', (d) => {
      if (d.seekTime != null) this.seek(d.seekTime);
    });
  }

  private updateMetadata(t: Track): void {
    if (typeof navigator === 'undefined' || !navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist || 'Louvores',
      album: 'Louvores',
      artwork: [{ src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/web/player.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/player.ts tests/web/player.test.ts
git commit -m "feat(web): player com fila, pulo em erro e retomada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Conteúdo de amostra e ícones

**Files:**
- Create: `scripts/make-sample.ts`, `scripts/make-icons.ts`
- Generated (commitar): `web/public/catalog.json`, `web/public/sample-audio/*.mp3`, `web/public/sample-audio/louvor-adoracao.zip`, `web/public/icons/{favicon.svg,icon-192.png,icon-512.png,apple-touch-icon.png}`

**Interfaces:**
- Consumes: `buildTree`, `planSync`, `DriveSnapshot` (Tasks 2 e 4).
- Produces: catálogo de amostra com `sample: true` usado pelo site e pelos testes E2E. Ids fixos que o E2E usa: coleção `louvor-adoracao` (nome "Louvor & Adoração", 3 faixas, com zip), seções "Biblioteca Completa" e "Bônus".

Precisa do `ffmpeg` no PATH (já instalado nesta máquina).

- [ ] **Step 1: Implementar `scripts/make-sample.ts`**

```ts
import archiver from 'archiver';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planSync } from '../sync/plan';
import { buildTree, type DriveSnapshot } from '../sync/tree';

const OUT = 'web/public/sample-audio';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const folders: DriveSnapshot['folders'] = [
  { id: 'root', name: 'Louvores - SVA', parentId: null },
  { id: 'biblioteca', name: 'Biblioteca Completa', parentId: 'root' },
  { id: 'louvor-adoracao', name: 'Louvor & Adoração', parentId: 'biblioteca' },
  { id: 'louvor-antigas', name: 'Louvor das Antigas', parentId: 'biblioteca' },
  { id: 'grupo-integracao', name: 'Grupo Integração', parentId: 'biblioteca' },
  { id: 'grande-deus', name: 'Grande Deus', parentId: 'grupo-integracao' },
  { id: 'juntos-lar', name: 'Juntos Vamos ao Lar', parentId: 'grupo-integracao' },
  { id: 'bonus', name: 'Bônus', parentId: 'root' },
  { id: 'hinos-infantis', name: 'Hinos Infantis', parentId: 'bonus' },
  { id: 'lancamentos', name: 'Lançamentos 2026', parentId: 'bonus' },
];

const spec: [string, string, string][] = [
  ['a1', 'louvor-adoracao', '01 - Aline Barros - Consagração _ Louvor ao Rei (Ao Vivo).mp3'],
  ['a2', 'louvor-adoracao', '02 - Fernandinho - O Hino (Ao Vivo).mp3'],
  ['a3', 'louvor-adoracao', '03 - Adhemar De Campos - Meu Louvor Virá de Ti.mp3'],
  ['b1', 'louvor-antigas', 'Cassiane - Com Muito Louvor.mp3'],
  ['b2', 'louvor-antigas', 'Cassiane - Hino da Vitória.mp3'],
  ['b3', 'louvor-antigas', 'Harpa Cristã - Porque Ele Vive.mp3'],
  ['c1', 'grande-deus', 'Grupo Integração - Grande Deus.mp3'],
  ['c2', 'grande-deus', 'Grupo Integração - Vem Adorar.mp3'],
  ['d1', 'juntos-lar', 'Grupo Integração - Juntos Vamos ao Lar.mp3'],
  ['d2', 'juntos-lar', 'Grupo Integração - Caminhando para o Lar.mp3'],
  ['e1', 'hinos-infantis', 'Trem Feliz.mp3'],
  ['e2', 'hinos-infantis', 'Meu Barquinho.mp3'],
  ['f1', 'lancamentos', 'Louvor Novo.mp3'],
];

const files: DriveSnapshot['files'] = spec.map(([id, parentId, name], i) => {
  const path = join(OUT, `${id}.mp3`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${220 + i * 40}:duration=20`, '-b:a', '64k', path]);
  return { id, name, parentId, md5: createHash('md5').update(readFileSync(path)).digest('hex'), size: statSync(path).size };
});

const snap: DriveSnapshot = { rootId: 'root', folders, files };
const { catalog } = planSync(snap, buildTree(snap), null, 'https://example.invalid', new Date().toISOString());
catalog.sample = true;
for (const t of catalog.tracks) t.url = `./sample-audio/${t.id}.mp3`;

async function zipSample(): Promise<void> {
  const out = createWriteStream(join(OUT, 'louvor-adoracao.zip'));
  const zip = archiver('zip', { store: true });
  const done = new Promise<void>((resolve, reject) => {
    out.on('close', () => resolve());
    zip.on('error', reject);
  });
  zip.pipe(out);
  for (const t of catalog.tracks.filter((x) => x.collectionId === 'louvor-adoracao')) {
    zip.file(join(OUT, `${t.id}.mp3`), { name: t.fileName });
  }
  await zip.finalize();
  await done;
}

await zipSample();
const col = catalog.collections.find((c) => c.id === 'louvor-adoracao')!;
col.zipUrls = ['./sample-audio/louvor-adoracao.zip'];
writeFileSync('web/public/catalog.json', JSON.stringify(catalog, null, 2));
console.log(`Amostra: ${catalog.tracks.length} faixas, ${catalog.collections.length} coleções.`);
```

- [ ] **Step 2: Implementar `scripts/make-icons.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1F4E79"/>
  <path fill="#FFFFFF" d="M352 96v220a64 64 0 1 1-40-59V160l-136 30v170a64 64 0 1 1-40-59V158z"/>
</svg>`;

mkdirSync('web/public/icons', { recursive: true });
writeFileSync('web/public/icons/favicon.svg', svg);
const sizes: [string, number][] = [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]];
for (const [name, size] of sizes) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`web/public/icons/${name}`);
}
console.log('Ícones gerados.');
```

- [ ] **Step 3: Gerar e conferir**

Run: `npm run sample && npm run icons`
Expected: `Amostra: 13 faixas, 10 coleções.` e `Ícones gerados.` (Todas as pastas-pai da amostra têm 2+ filhas, então nenhuma é colapsada.)

Run: `ls web/public/sample-audio web/public/icons`
Expected: 13 `.mp3` + `louvor-adoracao.zip`; 4 arquivos de ícone.

- [ ] **Step 4: Commit**

```bash
git add scripts web/public
git commit -m "feat: conteúdo de amostra e ícones do app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Interface do site + testes ponta a ponta

**Files:**
- Create: `vite.config.ts`, `playwright.config.ts`, `web/index.html`, `web/src/dom.ts`, `web/src/icons.ts`, `web/src/components.ts`, `web/src/views.ts`, `web/src/playerBar.ts`, `web/src/main.ts`, `web/src/styles.css`
- Test: `e2e/site.spec.ts`

**Interfaces:**
- Consumes: Tasks 7, 8, 9 e o catálogo de amostra (Task 10).
- Produces:
```ts
// dom.ts
type Child = Node | string | number | null | undefined | false
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, unknown>, ...children: Child[]): HTMLElementTagNameMap[K]
// views.ts
interface Ctx { idx: CatalogIndex; player: Player; platform: Platform; onCleanup(fn: () => void): void }
function renderHome(ctx: Ctx): HTMLElement
function renderCollection(ctx: Ctx, id: string): HTMLElement
function renderSearch(ctx: Ctx, q: string): HTMLElement
function renderError(retry: () => void): HTMLElement
// playerBar.ts
function renderPlayerBar(player: Player): HTMLElement
```

- [ ] **Step 1: Configurar Vite e Playwright**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
  preview: { port: 4173, strictPort: true },
});
```

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'computador', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

Run: `npx playwright install chromium`

- [ ] **Step 2: Escrever o teste E2E que falha**

`e2e/site.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('início mostra seções e capas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Louvores' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Biblioteca Completa' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Bônus' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Louvor & Adoração/ })).toBeVisible();
});

test('abre coleção, toca, avança e mostra downloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Louvor & Adoração/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Louvor & Adoração' })).toBeVisible();

  await page.getByRole('button', { name: 'Tocar Consagração / Louvor ao Rei (Ao Vivo)' }).click();
  const bar = page.getByRole('region', { name: 'Tocador' });
  await expect(bar).toBeVisible();
  await expect(bar.locator('.pb-title')).toHaveText('Consagração / Louvor ao Rei (Ao Vivo)');

  await bar.getByRole('button', { name: 'Próxima' }).click();
  await expect(bar.locator('.pb-title')).toHaveText('O Hino (Ao Vivo)');

  await expect(page.getByRole('link', { name: 'Baixar O Hino (Ao Vivo)' })).toBeVisible();
});

test('baixar todas: zip no computador, sequência no celular', async ({ page }, info) => {
  await page.goto('/#/c/louvor-adoracao');
  if (info.project.name === 'computador') {
    await expect(page.getByRole('link', { name: /Baixar todas \(\.zip\)/ })).toHaveAttribute('href', './sample-audio/louvor-adoracao.zip');
  } else {
    await expect(page.getByRole('button', { name: /Baixar todas/ })).toBeVisible();
  }
});

test('busca ignora acentos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Buscar música' }).fill('hino vitoria');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('button', { name: 'Tocar Hino da Vitória' })).toBeVisible();
});

test('voltar de subcoleção leva à coleção-mãe', async ({ page }) => {
  await page.goto('/#/c/grande-deus');
  await page.getByRole('link', { name: '← Voltar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Grupo Integração' })).toBeVisible();
  await page.getByRole('link', { name: '← Voltar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Louvores' })).toBeVisible();
});

test('sem rolagem horizontal em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/', '/#/c/louvor-adoracao', '/#/busca?q=louvor']) {
    await page.goto(path);
    await page.waitForSelector('h1');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(360);
  }
});

test('coleção inexistente mostra aviso', async ({ page }) => {
  await page.goto('/#/c/nao-existe');
  await expect(page.getByRole('heading', { level: 1, name: 'Coleção não encontrada' })).toBeVisible();
});
```

Run: `npx playwright test`
Expected: FAIL (build falha: `web/index.html` não existe).

- [ ] **Step 3: Criar `web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="theme-color" content="#1F4E79" />
    <title>Louvores</title>
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="icon" href="./icons/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Louvores" />
  </head>
  <body>
    <div id="app"><p class="page loading">Carregando…</p></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Criar `web/src/dom.ts` e `web/src/icons.ts`**

`web/src/dom.ts`:
```ts
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'value' && 'value' in el) {
      (el as HTMLInputElement).value = String(value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}
```

`web/src/icons.ts`:
```ts
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

export const ICONS = {
  play: svg('M8 5v14l11-7z'),
  pause: svg('M6 5h4v14H6zm8 0h4v14h-4z'),
  prev: svg('M6 6h2v12H6zm3.5 6 8.5 6V6z'),
  next: svg('M16 6h2v12h-2zM6 18l8.5-6L6 6z'),
};
```

- [ ] **Step 5: Criar `web/src/components.ts`**

```ts
import type { Collection, Track } from '../../shared/catalog';
import type { CatalogIndex } from './catalogIndex';
import { h } from './dom';
import { collectionDownloadMode, downloadSequential } from './downloads';
import { countLabel } from './format';
import { hrefFor } from './router';
import type { Ctx } from './views';

export function searchForm(q: string): HTMLFormElement {
  const input = h('input', {
    type: 'search', name: 'q', value: q, placeholder: 'Nome da música ou cantor',
    'aria-label': 'Buscar música', enterkeyhint: 'search', autocomplete: 'off',
  });
  return h('form', {
    class: 'search', role: 'search',
    onsubmit: (e: Event) => {
      e.preventDefault();
      const value = input.value.trim();
      if (value) location.hash = hrefFor({ name: 'search', q: value });
    },
  }, input, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Buscar'));
}

export function tileGrid(idx: CatalogIndex, cols: Collection[]): HTMLElement {
  return h('div', { class: 'tiles' }, ...cols.map((c) =>
    h('a', { class: 'tile', href: hrefFor({ name: 'collection', id: c.id }), style: `--c:${c.color}` },
      h('span', { class: 'tile-name' }, c.name),
      h('span', { class: 'tile-count' }, countLabel(idx.totalTracks(c.id))))));
}

export function trackList(ctx: Ctx, tracks: Track[]): HTMLElement {
  const list = h('ol', { class: 'tracks' }, ...tracks.map((t, i) =>
    h('li', { class: 'track', 'data-id': t.id },
      h('button', {
        class: 'track-play', type: 'button', 'aria-label': `Tocar ${t.title}`,
        onclick: () => ctx.player.playQueue(tracks, i),
      },
        h('span', { class: 'track-num', 'aria-hidden': 'true' }, i + 1),
        h('span', { class: 'track-text' },
          h('span', { class: 'track-title' }, t.title),
          t.artist ? h('span', { class: 'track-artist' }, t.artist) : null)),
      h('a', { class: 'btn btn-small', href: t.url, download: t.fileName, 'aria-label': `Baixar ${t.title}` }, 'Baixar'))));
  ctx.onCleanup(ctx.player.subscribe((s) => {
    for (const li of Array.from(list.children) as HTMLElement[]) {
      li.classList.toggle('is-current', li.dataset.id === s.current?.id);
    }
  }));
  return list;
}

export function downloadAll(ctx: Ctx, c: Collection, tracks: Track[]): HTMLElement {
  const mode = collectionDownloadMode(ctx.platform, c.zipUrls.length > 0);
  if (mode === 'none') {
    return h('p', { class: 'note' }, 'No iPhone, baixe uma música por vez no botão “Baixar”.');
  }
  if (mode === 'zip') {
    return h('div', { class: 'zip-links' }, ...c.zipUrls.map((url, i) =>
      h('a', { class: 'btn btn-big', href: url, download: '' },
        c.zipUrls.length === 1 ? '⬇ Baixar todas (.zip)' : `⬇ Baixar parte ${i + 1} de ${c.zipUrls.length} (.zip)`)));
  }
  const status = h('p', { class: 'note', role: 'status', 'aria-live': 'polite' });
  const button: HTMLButtonElement = h('button', {
    class: 'btn btn-big', type: 'button',
    onclick: async () => {
      button.disabled = true;
      await downloadSequential(tracks.map((t) => t.url), (done, total) => {
        status.textContent = done < total
          ? `Baixando ${done + 1} de ${total}… Se aparecer uma pergunta, toque em “Permitir”.`
          : `Pronto! ${countLabel(total)} enviadas para a pasta Downloads.`;
      });
      button.disabled = false;
    },
  }, '⬇ Baixar todas');
  return h('div', { class: 'download-all' }, button, status);
}
```

- [ ] **Step 6: Criar `web/src/views.ts`**

```ts
import { h } from './dom';
import type { CatalogIndex } from './catalogIndex';
import type { Platform } from './downloads';
import { countLabel } from './format';
import type { Player } from './player';
import { hrefFor } from './router';
import { searchTracks } from './search';
import { downloadAll, searchForm, tileGrid, trackList } from './components';

export interface Ctx {
  idx: CatalogIndex;
  player: Player;
  platform: Platform;
  onCleanup(fn: () => void): void;
}

const page = (...children: (Node | null)[]) => h('main', { class: 'page', id: 'conteudo' }, ...children);
const backLink = (href: string) => h('a', { class: 'back', href }, '← Voltar');

export function renderHome(ctx: Ctx): HTMLElement {
  return page(
    h('h1', { class: 'site-title', tabindex: '-1' }, 'Louvores'),
    searchForm(''),
    ...ctx.idx.homeSections().map((s) =>
      h('section', { class: 'section' }, h('h2', {}, s.title), tileGrid(ctx.idx, s.collections))),
  );
}

export function renderCollection(ctx: Ctx, id: string): HTMLElement {
  const c = ctx.idx.collection(id);
  if (!c) {
    return page(
      backLink(hrefFor({ name: 'home' })),
      h('h1', { tabindex: '-1' }, 'Coleção não encontrada'),
      h('p', { class: 'note' }, 'Ela pode ter sido renomeada ou removida. Volte ao início para escolher outra.'),
    );
  }
  const tracks = ctx.idx.tracksOf(id);
  const kids = ctx.idx.childrenOf(id);
  const back = ctx.idx.backTarget(id);
  return page(
    backLink(back ? hrefFor({ name: 'collection', id: back }) : hrefFor({ name: 'home' })),
    h('header', { class: 'col-header', style: `--c:${c.color}` },
      h('h1', { tabindex: '-1' }, c.name),
      h('p', {}, countLabel(ctx.idx.totalTracks(id)))),
    tracks.length
      ? h('div', { class: 'actions' },
          h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: () => ctx.player.playQueue(tracks, 0) }, '▶ Tocar tudo'),
          downloadAll(ctx, c, tracks))
      : null,
    kids.length
      ? h('section', { class: 'section' }, tracks.length ? h('h2', {}, 'Coleções') : null, tileGrid(ctx.idx, kids))
      : null,
    tracks.length ? trackList(ctx, tracks) : null,
  );
}

export function renderSearch(ctx: Ctx, q: string): HTMLElement {
  const results = q ? searchTracks(ctx.idx.data.tracks, q) : [];
  const summary = !q
    ? null
    : results.length
      ? h('p', { class: 'note', role: 'status' }, `${countLabel(results.length)} encontrada${results.length === 1 ? '' : 's'} para “${q}”`)
      : h('p', { class: 'note', role: 'status' }, `Nenhuma música encontrada para “${q}”. Tente só uma palavra do nome.`);
  return page(
    backLink(hrefFor({ name: 'home' })),
    h('h1', { tabindex: '-1' }, 'Buscar'),
    searchForm(q),
    summary,
    results.length ? trackList(ctx, results) : null,
  );
}

export function renderError(retry: () => void): HTMLElement {
  return h('main', { class: 'page error-screen' },
    h('h1', {}, 'Sem conexão'),
    h('p', {}, 'Não foi possível carregar as músicas. Verifique a internet e tente de novo.'),
    h('button', { class: 'btn btn-primary btn-big', type: 'button', onclick: retry }, 'Tentar de novo'));
}
```

- [ ] **Step 7: Criar `web/src/playerBar.ts`**

```ts
import { h } from './dom';
import { formatTime } from './format';
import { ICONS } from './icons';
import type { Player } from './player';

function controlButton(icon: string, label: string, onclick: () => void, extraClass = ''): HTMLButtonElement {
  const iconEl = h('span', { class: 'pb-icon' });
  iconEl.innerHTML = icon;
  return h('button', { type: 'button', class: `pb-btn ${extraClass}`.trim(), onclick }, iconEl, h('span', { class: 'pb-label' }, label));
}

export function renderPlayerBar(player: Player): HTMLElement {
  const title = h('p', { class: 'pb-title' });
  const artist = h('p', { class: 'pb-artist' });
  const error = h('p', { class: 'pb-error', role: 'alert' });
  const range = h('input', { type: 'range', class: 'pb-range', min: '0', max: '0', step: '1', value: '0', 'aria-label': 'Posição da música' });
  const time = h('span', { class: 'pb-time' });
  const prev = controlButton(ICONS.prev, 'Anterior', () => player.prev());
  const play = controlButton(ICONS.play, 'Tocar', () => player.toggle(), 'pb-play');
  const next = controlButton(ICONS.next, 'Próxima', () => player.next());

  let dragging = false;
  range.addEventListener('input', () => { dragging = true; });
  range.addEventListener('change', () => {
    dragging = false;
    player.seek(Number(range.value));
  });

  const bar = h('div', { class: 'player', hidden: true, role: 'region', 'aria-label': 'Tocador' },
    h('div', { class: 'pb-info' }, title, artist, error),
    h('div', { class: 'pb-progress' }, range, time),
    h('div', { class: 'pb-controls' }, prev, play, next));

  let wasPlaying: boolean | null = null;
  player.subscribe((s) => {
    bar.hidden = !s.current;
    document.body.classList.toggle('has-player', !!s.current);
    if (!s.current) return;
    title.textContent = s.current.title;
    artist.textContent = s.current.artist;
    error.textContent = s.error ?? '';
    if (wasPlaying !== s.playing) {
      wasPlaying = s.playing;
      play.querySelector('.pb-icon')!.innerHTML = s.playing ? ICONS.pause : ICONS.play;
      play.querySelector('.pb-label')!.textContent = s.playing ? 'Pausar' : 'Tocar';
    }
    range.max = String(Math.floor(s.duration));
    if (!dragging) range.value = String(Math.floor(s.currentTime));
    time.textContent = `${formatTime(s.currentTime)} / ${formatTime(s.duration)}`;
  });
  return bar;
}
```

- [ ] **Step 8: Criar `web/src/main.ts`**

```ts
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles.css';
import { CatalogIndex, loadCatalog } from './catalogIndex';
import { h } from './dom';
import { detectPlatform } from './downloads';
import { Player } from './player';
import { renderPlayerBar } from './playerBar';
import { parseHash } from './router';
import { renderCollection, renderError, renderHome, renderSearch, type Ctx } from './views';

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  let idx: CatalogIndex;
  try {
    idx = new CatalogIndex(await loadCatalog());
  } catch {
    app.replaceChildren(renderError(() => void boot()));
    return;
  }

  const audio = new Audio();
  audio.preload = 'metadata';
  const player = new Player(audio);
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const outlet = h('div');
  app.replaceChildren(outlet, renderPlayerBar(player));
  player.restore((id) => idx.track(id));

  let cleanups: (() => void)[] = [];
  const render = () => {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    const ctx: Ctx = { idx, player, platform, onCleanup: (fn) => cleanups.push(fn) };
    const route = parseHash(location.hash);
    const view =
      route.name === 'collection' ? renderCollection(ctx, route.id)
      : route.name === 'search' ? renderSearch(ctx, route.q)
      : renderHome(ctx);
    outlet.replaceChildren(view);
    window.scrollTo(0, 0);
    view.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  };
  window.addEventListener('hashchange', render);
  render();

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

void boot();
```

- [ ] **Step 9: Criar `web/src/styles.css`**

```css
:root {
  --bg: #fbf8f3;
  --surface: #ffffff;
  --text: #1a1a1a;
  --muted: #4a4a4a;
  --line: #ddd6cc;
  --accent: #1f4e79;
  --accent-soft: #eaf1f8;
  --on-accent: #ffffff;
  --focus: #e8a317;
  --radius: 14px;
  --gutter: 16px;
  --player-h: 210px;
  font-size: 20px;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: 'Atkinson Hyperlegible', system-ui, sans-serif;
  line-height: 1.45;
}
body.has-player { padding-bottom: calc(var(--player-h) + env(safe-area-inset-bottom)); }
a { color: var(--accent); }
:focus-visible { outline: 4px solid var(--focus); outline-offset: 3px; }
h1:focus { outline: none; }

.page { max-width: 1100px; margin: 0 auto; padding: 20px var(--gutter) 32px; }
.site-title { font-size: 2rem; color: var(--accent); margin: 8px 0 16px; }
h1 { font-size: 1.8rem; line-height: 1.2; margin: 0; overflow-wrap: anywhere; }
h2 { font-size: 1.35rem; margin: 28px 0 12px; }
.loading, .note { color: var(--muted); font-size: 1rem; }

.search { display: flex; gap: 10px; margin: 8px 0; }
.search input {
  flex: 1; min-width: 0; min-height: 60px; padding: 0 16px;
  font: inherit; color: var(--text); background: var(--surface);
  border: 2px solid var(--muted); border-radius: var(--radius);
}

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 56px; padding: 0 20px;
  font: inherit; font-weight: 700; text-decoration: none; cursor: pointer;
  color: var(--accent); background: var(--surface);
  border: 2px solid var(--accent); border-radius: var(--radius);
}
.btn-primary { background: var(--accent); color: var(--on-accent); }
.btn-big { min-height: 64px; font-size: 1.1rem; }
.btn-small { min-height: 56px; padding: 0 14px; font-size: 0.9rem; flex: none; }
.btn:disabled { opacity: 0.6; cursor: default; }

.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (min-width: 700px) { .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (min-width: 1000px) { .tiles { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
.tile {
  aspect-ratio: 1; display: flex; flex-direction: column; justify-content: flex-end;
  padding: 14px; overflow: hidden; text-decoration: none;
  color: #fff; background: var(--c); border-radius: var(--radius);
}
.tile-name {
  font-weight: 700; font-size: 1.05rem; line-height: 1.2; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.tile-count { font-size: 0.85rem; margin-top: 6px; opacity: 0.92; }

.back { display: inline-flex; align-items: center; min-height: 56px; font-size: 1.1rem; font-weight: 700; text-decoration: none; }
.col-header { border-left: 12px solid var(--c); padding: 4px 0 4px 16px; margin: 4px 0 20px; }
.col-header p { margin: 6px 0 0; color: var(--muted); }
.actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
.zip-links { display: flex; flex-wrap: wrap; gap: 12px; }
.download-all .note { margin: 8px 0 0; max-width: 34ch; }

.tracks { list-style: none; margin: 20px 0 0; padding: 0; border-top: 1px solid var(--line); }
.track { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--line); }
.track-play {
  flex: 1; min-width: 0; min-height: 72px; padding: 10px 4px;
  display: flex; align-items: center; gap: 14px;
  font: inherit; color: inherit; text-align: left; cursor: pointer;
  background: none; border: 0;
}
.track-num { flex: none; width: 2.2em; text-align: right; color: var(--muted); font-size: 0.9rem; }
.track-text { min-width: 0; display: flex; flex-direction: column; }
.track-title { font-weight: 700; overflow-wrap: anywhere; }
.track-artist { color: var(--muted); font-size: 0.9rem; overflow-wrap: anywhere; }
.track.is-current { background: var(--accent-soft); }
.track.is-current .track-title { color: var(--accent); }

.player {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
  padding: 12px var(--gutter) calc(12px + env(safe-area-inset-bottom));
  background: var(--accent); color: var(--on-accent);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.2);
}
.player[hidden] { display: none; }
.player > * { max-width: 1100px; margin-left: auto; margin-right: auto; }
.pb-title { margin: 0; font-weight: 700; font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pb-artist { margin: 0; min-height: 1.2em; font-size: 0.85rem; opacity: 0.92; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pb-error { margin: 0; color: #ffd9d9; font-size: 0.85rem; }
.pb-error:empty { display: none; }
.pb-progress { display: flex; align-items: center; gap: 10px; margin-top: 6px; margin-bottom: 6px; }
.pb-range { flex: 1; min-width: 0; height: 36px; accent-color: #fff; }
.pb-time { font-size: 0.8rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pb-controls { display: flex; justify-content: center; gap: 14px; }
.pb-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-width: 76px; min-height: 64px; padding: 4px 10px;
  font: inherit; font-size: 0.75rem; color: #fff; cursor: pointer;
  background: transparent; border: 2px solid rgba(255, 255, 255, 0.6); border-radius: var(--radius);
}
.pb-play { min-width: 96px; font-weight: 700; color: var(--accent); background: #fff; border-color: #fff; }
.pb-icon svg { display: block; width: 28px; height: 28px; fill: currentColor; }

.error-screen { text-align: center; padding-top: 80px; }
```

- [ ] **Step 10: Rodar E2E e ver passar**

Run: `npx playwright test`
Expected: todos os testes passam nos projetos `celular` e `computador`.

Se o teste de 360px falhar, inspecionar qual elemento passa da largura com
`page.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > 360).map(e => e.className))`
e corrigir o CSS (normalmente `min-width: 0` ou `overflow-wrap: anywhere` faltando).

- [ ] **Step 11: Conferência visual**

Run: `npm run dev` e abrir `http://localhost:5173` no Chrome com emulação de celular (360×740). Tirar captura de: início, coleção com player aberto, busca. Conferir: letras grandes, capas legíveis, player não cobre a última faixa, foco visível ao navegar com Tab.

- [ ] **Step 12: Verificar tipos e testes unitários**

Run: `npm run check`
Expected: sem erros.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(web): telas de início, coleção, busca e player

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: App instalável (PWA) e bloqueio de buscadores

**Files:**
- Create: `web/public/manifest.webmanifest`, `web/public/sw.js`, `web/public/robots.txt`
- Modify: `e2e/site.spec.ts` (acrescentar teste)

- [ ] **Step 1: Escrever o teste que falha** (acrescentar ao fim de `e2e/site.spec.ts`)

```ts
test('manifesto, service worker e noindex', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Louvores', display: 'standalone', start_url: './' });
  expect((await request.get('/sw.js')).ok()).toBe(true);
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))).toBe(true);
});
```

Run: `npx playwright test -g manifesto`
Expected: FAIL (manifest 404).

- [ ] **Step 2: Criar os arquivos**

`web/public/manifest.webmanifest`:
```json
{
  "name": "Louvores",
  "short_name": "Louvores",
  "lang": "pt-BR",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#FBF8F3",
  "theme_color": "#1F4E79",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

`web/public/sw.js`:
```js
// Guarda só a "casca" do site. O áudio nunca é guardado aqui.
const CACHE = 'louvores-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/sample-audio/') || /\.(mp3|m4a|aac|ogg|opus|zip)$/i.test(url.pathname)) return;

  const networkFirst = req.mode === 'navigate' || url.pathname.endsWith('/catalog.json');
  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
  );
});
```

`web/public/robots.txt`:
```
User-agent: *
Disallow: /
```

- [ ] **Step 3: Rodar todos os E2E**

Run: `npx playwright test`
Expected: todos passam.

- [ ] **Step 4: Commit**

```bash
git add web/public/manifest.webmanifest web/public/sw.js web/public/robots.txt e2e/site.spec.ts
git commit -m "feat(web): app instalável e bloqueio de buscadores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Guia de configuração do dono + verificação final local

**Files:**
- Create: `SETUP.md`

- [ ] **Step 1: Escrever `SETUP.md`**

```markdown
# Colocar o site no ar (configuração única)

Leva uns 15 minutos. Depois disso o site se atualiza sozinho todo dia às 3h (horário de Brasília).

## 1. Conta do GitHub só para o site

1. Abra https://github.com/signup e crie uma conta nova (use um e-mail diferente da sua conta principal).
2. Confirme o e-mail.
3. No terminal do VS Code, rode `gh auth login` e escolha: GitHub.com → HTTPS → Login with a web browser. Entre com a conta nova.

## 2. "Robô" do Google com acesso de leitura à pasta

1. Abra https://console.cloud.google.com/projectcreate, nome do projeto `louvores`, clique em **Criar**.
2. Abra https://console.cloud.google.com/apis/library/drive.googleapis.com e clique em **Ativar**.
3. Abra https://console.cloud.google.com/iam-admin/serviceaccounts → **Criar conta de serviço** → nome `louvores-sync` → **Concluir** (pule as permissões).
4. Clique na conta criada → aba **Chaves** → **Adicionar chave** → **Criar nova chave** → **JSON**. Um arquivo será baixado.
5. Copie o e-mail da conta de serviço (termina em `iam.gserviceaccount.com`).
6. No Google Drive, clique com o botão direito na pasta **Louvores - SVA** → **Compartilhar** → cole o e-mail → permissão **Leitor** → desmarque "Notificar" → **Compartilhar**.
7. Me diga onde ficou o arquivo JSON baixado. Eu cuido do resto e apago a cópia local depois.

## O que eu faço em seguida

- Crio o repositório público `louvores` na conta nova e envio o código.
- Guardo a chave como segredo `GDRIVE_SA_JSON` (ela nunca fica visível no repositório).
- Ativo o GitHub Pages e rodo a primeira sincronização. A primeira carga do acervo pode levar alguns ciclos (cada ciclo dura até 5 horas); o site já funciona com o que tiver sido enviado.
- Testo a reprodução num iPhone e num Android com você.
```

- [ ] **Step 2: Verificação completa local**

Run: `npm run check && npm run build && npx playwright test`
Expected: tipos ok, todos os testes unitários e E2E passam, `dist/` gerado com `index.html`, `catalog.json`, `manifest.webmanifest`, `sw.js`, `robots.txt`, `icons/`, `sample-audio/`.

- [ ] **Step 3: Commit**

```bash
git add SETUP.md
git commit -m "docs: guia de configuração única para colocar no ar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Colocar no ar (com o dono — única interrupção)

Executada depois que o dono concluir o `SETUP.md`. Sem código novo, salvo correções que a validação exigir.

- [ ] **Step 1:** Instalar o GitHub CLI se faltar (`winget install --id GitHub.cli -e`); o dono faz `gh auth login` com a conta dedicada.
- [ ] **Step 2:** `gh repo create louvores --public --source . --push`
- [ ] **Step 3:** `gh secret set GDRIVE_SA_JSON < "<caminho do JSON>"` e depois apagar o JSON local.
- [ ] **Step 4:** Ativar Pages com origem GitHub Actions: `gh api -X POST repos/{owner}/louvores/pages -f build_type=workflow`
- [ ] **Step 5 — Validar o risco principal antes da carga completa:** rodar `gh workflow run site.yml`, aguardar (`gh run watch`) e, assim que houver ao menos um release com áudio, conferir:
  - `curl -sIL "<url de uma faixa>"` → status final 200, aceita `Range` (`curl -s -r 0-99 -o NUL -w "%{http_code}" <url>` retorna `206`).
  - No Chrome desktop (via DevTools MCP): a faixa toca e o avanço pela barra funciona.
  - Pedir ao dono para abrir o link num **iPhone** e num **Android**: tocar, avançar pela barra, controlar pela tela de bloqueio.
  - **Se o iPhone não tocar:** aplicar o plano B do spec (áudio servido por Pages a partir de repositórios de mídia separados) antes de continuar a carga.
- [ ] **Step 6:** Acompanhar os ciclos até `Pendentes para o próximo ciclo: 0` no resumo do Actions.
- [ ] **Step 7:** Entregar ao dono o link final `https://<conta>.github.io/louvores/` e uma mensagem pronta para o WhatsApp explicando como instalar o ícone na tela inicial.
