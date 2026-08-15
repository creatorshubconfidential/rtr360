import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const svg = readFileSync('public/icons/icon-192x192.svg');

async function main() {
  await sharp(svg).resize(192, 192).png().toFile('public/icons/icon-192x192.png');
  await sharp(svg).resize(512, 512).png().toFile('public/icons/icon-512x512.png');
  // Apple touch icon
  await sharp(svg).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
  console.log('Icons generated!');
}
main().catch(console.error);
