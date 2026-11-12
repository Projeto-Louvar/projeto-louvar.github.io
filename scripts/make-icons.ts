import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const note = '<path fill="#D9B65C" d="M352 96v220a64 64 0 1 1-40-59V160l-136 30v170a64 64 0 1 1-40-59V158z"/>';
const wrap = (rx: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512"${rx} fill="#0F1013"/>
  ${note}
</svg>`;
// Arredondado: favicon e icon-192. Quadrado (sem cantos): iOS e ícone "maskable" exigem tela cheia.
const svg = wrap(' rx="96"');
const svgFull = wrap('');

mkdirSync('web/public/icons', { recursive: true });
writeFileSync('web/public/icons/favicon.svg', svg);
const sizes: [string, number, string][] = [
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svgFull],
  ['apple-touch-icon.png', 180, svgFull],
];
for (const [name, size, source] of sizes) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(`web/public/icons/${name}`);
}
console.log('Ícones gerados.');
