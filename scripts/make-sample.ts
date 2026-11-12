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
// O site publicado usa o catálogo real (gerado pelo sync); o de amostra fica para os testes E2E.
writeFileSync('e2e/fixtures/catalog.json', JSON.stringify(catalog, null, 2));
console.log(`Amostra: ${catalog.tracks.length} faixas, ${catalog.collections.length} coleções.`);
