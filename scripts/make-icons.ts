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
