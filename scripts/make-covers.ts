// Gera as capas das coleções a partir de scripts/covers-source.json.
// Para trocar uma foto: edite a entrada no JSON e rode `npm run covers`.
// O nome do arquivo leva um hash do conteúdo: o service worker guarda imagens para sempre,
// então uma foto nova precisa de um nome novo para chegar a quem já abriu o site.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

interface Source { id: string; name: string; thumb: string; artist: string; license: string; page: string }
interface CoverEntry { file: string; name: string; artist: string; license: string; page: string; thumb?: string }

const DATA = 'web/src/coverData.json';
const OUT = 'web/public/covers';
const sources = JSON.parse(readFileSync('scripts/covers-source.json', 'utf8')) as Source[];
const previous: Record<string, CoverEntry> = existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : {};
const force = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const covers: Record<string, CoverEntry> = {};

for (const s of sources) {
  const old = previous[s.id];
  // Reaproveita a imagem já gerada se a origem não mudou
  if (!force && old && old.thumb === s.thumb && existsSync(`web/public/${old.file}`)) {
    covers[s.id] = { ...old, name: s.name, artist: s.artist, license: s.license, page: s.page };
    continue;
  }
  const res = await fetch(s.thumb, { headers: { 'User-Agent': 'louvores-site/1.0 (capas das coleções)' } });
  if (!res.ok) throw new Error(`${s.name}: HTTP ${res.status} em ${s.thumb}`);
  const webp = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(600, 600, { fit: 'cover', position: 'attention' })
    .webp({ quality: 78 })
    .toBuffer();
  const hash = createHash('sha256').update(webp).digest('hex').slice(0, 8);
  const file = `covers/${s.id.replace(/[^A-Za-z0-9_-]/g, '')}-${hash}.webp`;
  writeFileSync(`web/public/${file}`, webp);
  covers[s.id] = { file, name: s.name, artist: s.artist, license: s.license, page: s.page, thumb: s.thumb };
  await sleep(800); // respeita o limite de uso do Wikimedia
}

// Apaga imagens que não são mais usadas
const used = new Set(Object.values(covers).map((c) => c.file.replace('covers/', '')));
for (const f of readdirSync(OUT)) if (!used.has(f)) rmSync(`${OUT}/${f}`);

writeFileSync(DATA, `${JSON.stringify(covers, null, 2)}\n`);
console.log(`${sources.length} capas prontas em ${OUT}`);
