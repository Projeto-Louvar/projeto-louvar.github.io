import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

// Nota musical cuja haste forma uma cruz. Deslocada para o centro exato do ícone (medido pelo contorno).
const note = `<g transform="translate(-13 -3)" fill="#D9B65C">
    <rect x="268" y="92" width="34" height="270" rx="4"/>
    <rect x="200" y="148" width="170" height="34" rx="4"/>
    <ellipse cx="236" cy="372" rx="70" ry="50" transform="rotate(-24 236 372)"/>
  </g>`;
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
