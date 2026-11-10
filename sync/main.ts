import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Catalog, Track } from '../shared/catalog';
import { createDrive, downloadToFile, snapshotDrive } from './drive';
import { Releases } from './github';
import { contentTypeFor, uniqueEntryNames } from './names';
import { assetUrl, finalizeCatalog, orphanUrls, planSync, zipReady } from './plan';
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

  const catalog = finalizeCatalog(plan.catalog, notReady, prev);
  const trackById = new Map(catalog.tracks.map((t) => [t.id, t]));
  const replacedZips: string[] = [];

  for (const z of plan.zips) {
    if (outOfTime()) break;
    const col = catalog.collections.find((c) => c.id === z.collectionId);
    if (!col || !zipReady(z.collectionId, catalog, plan.catalog)) continue;
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

  // Só apaga assets individuais, nunca releases inteiras (o dedup por md5 faz faixas apontarem para releases de outras coleções).
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
