import { appendFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Catalog, Track } from '../shared/catalog';
import { createDrive, downloadToFile, snapshotDrive } from './drive';
import { RateLimitError, Releases } from './github';
import { contentTypeFor, uniqueEntryNames } from './names';
import { assetUrl, deletableNow, finalizeCatalog, keepGeneratedAt, massDeletionBlocked, nextPendingDeletes, planSync, zipReady } from './plan';
import { buildTree, driveReport } from './tree';
import { buildZip } from './zipper';
import { MAX_ZIP_BYTES, splitIntoParts, zipAssetName } from './zips';

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Variável de ambiente ${key} não definida`);
  return v;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
// github.ts já espera e repete os limites de uso; um 401/403 que chega aqui é erro real de permissão.
const isFatal = (e: unknown) => !(e instanceof RateLimitError) && /HTTP 40[13]/.test(errMsg(e));
const CHECKPOINT_EVERY = 50;
const ZIP_MARGIN_MS = 30 * 60_000;

async function main(): Promise<void> {
  const started = Date.now();
  const budgetMs = Number(env('TIME_BUDGET_MIN', '300')) * 60_000;
  const outOfTime = () => Date.now() - started > budgetMs;
  const catalogPath = env('CATALOG_PATH', 'web/public/catalog.json');

  const prevRaw = existsSync(catalogPath) ? (JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog) : null;
  const prev = prevRaw && !prevRaw.sample ? prevRaw : null;

  const drive = createDrive(env('GDRIVE_SA_JSON'));
  const gh = new Releases(env('GITHUB_TOKEN'), env('GITHUB_REPOSITORY'), started + budgetMs);

  const snap = await snapshotDrive(drive, env('ROOT_FOLDER_ID', '1ak8DwNK4UeRQmKLpKhEao-XdyEj0Z8EC'));
  const tree = buildTree(snap);
  const plan = planSync(snap, tree, prev, gh.repoBase, new Date().toISOString());
  const nameOf = new Map(tree.map((c) => [`c-${c.id}`, c.name]));
  const tmp = mkdtempSync(join(tmpdir(), 'louvores-'));

  const notReady = new Set<string>();
  const failures: string[] = [];
  let uploaded = 0;
  let skipped = 0;
  let checkpointDue = false;
  let fatal = false;
  let rateLimited = false;
  const halted = () => fatal || rateLimited || outOfTime();
  const onError = (e: unknown) => {
    if (e instanceof RateLimitError) rateLimited = true;
    else if (isFatal(e)) fatal = true;
  };
  const writeCatalog = (c: Catalog) => {
    if (prev && keepGeneratedAt(prev, c, Date.now())) c.generatedAt = prev.generatedAt;
    writeFileSync(`${catalogPath}.tmp`, JSON.stringify(c));
    renameSync(`${catalogPath}.tmp`, catalogPath);
  };

  const checkpoint = (nextIndex: number) => {
    // jobs ainda não tentados contam como pendentes: o checkpoint nunca inclui faixa sem upload concluído
    const pendingNow = new Set(notReady);
    for (let k = nextIndex; k < plan.uploads.length; k++) pendingNow.add(plan.uploads[k].url);
    const cp = finalizeCatalog(plan.catalog, pendingNow, prev);
    cp.pendingDeletes = nextPendingDeletes(prev, cp, [], []);
    writeCatalog(cp);
  };

  for (const [idx, job] of plan.uploads.entries()) {
    if (halted()) {
      notReady.add(job.url);
      continue;
    }
    const file = join(tmp, job.assetName);
    try {
      const rel = await gh.ensure(job.tag, nameOf.get(job.tag) ?? job.tag);
      if (gh.hasSameSize(rel, job.assetName, job.size)) skipped++;
      else {
        await downloadToFile(drive, job.fileId, file);
        await gh.upload(rel, job.assetName, file, contentTypeFor(job.assetName));
        uploaded++;
        if (uploaded % CHECKPOINT_EVERY === 0) checkpointDue = true;
      }
    } catch (e) {
      notReady.add(job.url);
      failures.push(`${job.fileName}: ${errMsg(e)}`);
      onError(e);
    } finally {
      rmSync(file, { force: true });
    }
    if (checkpointDue) {
      checkpointDue = false;
      checkpoint(idx + 1);
    }
  }

  const catalog = finalizeCatalog(plan.catalog, notReady, prev);
  const trackById = new Map(catalog.tracks.map((t) => [t.id, t]));
  const replacedZips: string[] = [];
  catalog.pendingDeletes = nextPendingDeletes(prev, catalog, [], []);
  writeCatalog(catalog); // checkpoint: o progresso sobrevive a um timeout

  for (const z of plan.zips) {
    if (fatal || rateLimited || Date.now() - started > budgetMs - ZIP_MARGIN_MS) break;
    const col = catalog.collections.find((c) => c.id === z.collectionId);
    if (!col || !zipReady(z.collectionId, catalog, plan.catalog)) continue;
    const tracks: Track[] = col.trackIds.map((id) => trackById.get(id)!);
    const names = uniqueEntryNames(tracks.map((t) => t.fileName));
    const entries = tracks.map((t, i) => ({ name: names[i], url: t.url, size: t.size }));
    const parts = splitIntoParts(entries, MAX_ZIP_BYTES);
    const urls: string[] = [];
    try {
      const rel = await gh.ensure(z.tag, col.name);
      for (let p = 0; p < parts.length; p++) {
        if (outOfTime()) throw new Error('sem tempo; zip abandonado');
        const name = zipAssetName(`${z.baseName}-${z.zipKey.slice(0, 8)}`, p + 1, parts.length);
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
      replacedZips.push(...urls); // partes já enviadas ficam órfãs: vão para a exclusão adiada
      failures.push(`zip ${col.name}: ${errMsg(e)}`);
      onError(e);
    }
  }

  // Só apaga assets individuais (nunca releases inteiras) e só um ciclo depois de o catálogo commitado deixar de referenciá-los.
  const toDelete = deletableNow(prev, catalog);
  const deletedOK: string[] = [];
  let blocked = false;
  if (massDeletionBlocked(toDelete.length, prev) && process.env.ALLOW_MASS_DELETE !== '1') {
    blocked = true;
  } else {
    for (const url of toDelete) {
      if (halted()) break;
      try {
        await gh.deleteByUrl(url);
        deletedOK.push(url);
      } catch (e) {
        failures.push(`apagar ${url}: ${errMsg(e)}`);
        onError(e);
      }
    }
  }
  const pending = nextPendingDeletes(prev, catalog, replacedZips, deletedOK);
  if (pending.length) catalog.pendingDeletes = pending;
  else delete catalog.pendingDeletes;

  writeCatalog(catalog);
  rmSync(tmp, { recursive: true, force: true });

  const summary = [
    '## Sincronização dos louvores',
    `- Faixas no site: ${catalog.tracks.length}`,
    `- Coleções: ${catalog.collections.length}`,
    `- Enviadas agora: ${uploaded}`,
    `- Já existentes no GitHub: ${skipped}`,
    `- Pendentes para o próximo ciclo: ${notReady.size}`,
    `- Arquivos apagados: ${deletedOK.length}`,
    `- Apagar no próximo ciclo: ${pending.length}`,
    ...(blocked ? [`- ATENÇÃO: exclusão em massa bloqueada (${toDelete.length} arquivos). Confira o Drive; para liberar, rode manualmente o workflow 'Site' marcando 'allow_mass_delete'.`] : []),
    ...(rateLimited ? ['- Limite de uso do GitHub atingido; o envio continua no próximo ciclo.'] : []),
    ...(fatal ? ['- ERRO: acesso negado pelo GitHub (HTTP 401/403); ciclo interrompido.'] : []),
    `- Arquivos ignorados (não são áudio): ${snap.skipped?.length ?? 0}`,
    ...driveReport(snap),
    `- Falhas: ${failures.length}`,
    ...failures.slice(0, 50).map((f) => `  - ${f}`),
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (fatal) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
