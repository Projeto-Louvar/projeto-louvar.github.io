// Gera as duas versões do site em dist/:
//   dist/            versão pública: bônus trancados e sem os links de áudio dos bônus no catálogo
//   dist/<segredo>/  versão completa: tudo liberado (só se FULL_PATH ou --full-path= for informado)
// No GitHub Actions o endereço secreto vem do segredo FULL_PATH, que não fica no repositório.
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'vite';
import { publicCatalog } from '../shared/bonus';
import type { Catalog } from '../shared/catalog';

const arg = process.argv.find((a) => a.startsWith('--full-path='))?.split('=')[1];
const fullPath = (arg ?? process.env.FULL_PATH ?? '').trim();
if (fullPath && !/^[a-z0-9][a-z0-9-]{5,62}$/.test(fullPath)) {
  throw new Error('FULL_PATH deve ter só letras minúsculas, números e hífen (6 a 63 caracteres).');
}

process.env.VITE_EDITION = 'publica';
await build({ build: { outDir: '../dist', emptyOutDir: true }, logLevel: 'warn' });
const catalog = JSON.parse(readFileSync('web/public/catalog.json', 'utf8')) as Catalog;
writeFileSync('dist/catalog.json', JSON.stringify(publicCatalog(catalog)));
console.log('Versão pública pronta em dist/');

if (fullPath) {
  process.env.VITE_EDITION = 'completa';
  await build({ build: { outDir: `../dist/${fullPath}`, emptyOutDir: true }, logLevel: 'warn' });
  console.log('Versão completa pronta (endereço secreto).');
} else {
  console.log('Sem FULL_PATH: versão completa não gerada.');
}
