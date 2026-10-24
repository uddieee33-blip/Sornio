import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Preserve the supplied artwork. The SVG viewports and clip only select its
// pixels: no invented S, replacement gradients, or AI regeneration.
const root = process.cwd();
const source = await fs.readFile(path.join(root, 'docs/brand/sornio-approved-reference.jpeg'));
const artwork = `<image width="1448" height="1086" href="data:image/jpeg;base64,${source.toString('base64')}"/>`;
const output = path.join(root, 'public/brand');
await fs.mkdir(output, { recursive: true });

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1090 110 280 280" width="512" height="512" role="img" aria-labelledby="title"><title id="title">Sornio approved folded-ribbon app icon</title>${artwork}</svg>\n`;

// Clip along the photographed ribbon's silhouette to let the unchanged silver
// and blue-gray artwork sit on any theme surface. Coordinates are source pixels.
const outline = 'M1272 154.8 C1279 151.5 1285.2 154.6 1285.2 163.2 L1284.6 185.1 C1284.4 191.8 1280.1 197.4 1274.2 200.1 L1212.2 232.3 L1272.2 256 C1281 259.4 1286.5 267.9 1286.5 276.2 L1286 296.4 C1285.8 308 1281.4 313 1274 316.5 L1181.2 351.9 C1172.1 355.7 1166 351.6 1166 341.3 L1165.7 325 C1165.5 315 1169.6 310.8 1176.5 307.5 L1227.4 283.2 L1186 267.2 C1171.1 261.4 1164.8 252.9 1164.6 239.2 L1164.6 222.2 C1164.6 211.5 1169.5 204.3 1179.5 198.9 Z';
const ribbon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1162 151 127 205" width="127" height="205" role="img" aria-labelledby="title"><title id="title">Sornio approved silver and blue-gray folded ribbon</title><defs><clipPath id="ribbon"><path d="${outline}"/></clipPath></defs><g clip-path="url(#ribbon)">${artwork}</g></svg>\n`;
// Bake the SVG viewports once so each delivered SVG embeds only its selected
// artwork, not the entire presentation sheet. These are raster-backed SVGs.
const iconPixels = await sharp(Buffer.from(icon)).png().toBuffer();
const ribbonPixels = await sharp(Buffer.from(ribbon)).png().toBuffer();
const deliveredSvg = (pixels, width, height, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="title"><title id="title">${title}</title><image width="${width}" height="${height}" href="data:image/png;base64,${pixels.toString('base64')}"/></svg>\n`;
await fs.writeFile(path.join(output, 'sornio-app-icon.svg'), deliveredSvg(iconPixels, 512, 512, 'Sornio approved folded-ribbon app icon'));
await fs.writeFile(path.join(output, 'sornio-ribbon.svg'), deliveredSvg(ribbonPixels, 127, 205, 'Sornio approved silver and blue-gray folded ribbon'));
// Keep previous public URLs usable without serving the previous brand.
await fs.copyFile(path.join(output, 'sornio-app-icon.svg'), path.join(output, 'dukaanos-app-icon.svg'));
await fs.writeFile(path.join(output, 'dukaanos-wordmark.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 125" role="img" aria-label="Sornio"><image x="4" y="2" width="75" height="121" href="data:image/png;base64,${ribbonPixels.toString('base64')}"/><text x="100" y="80" fill="#0D1117" font-family="Inter,Arial,sans-serif" font-size="72" font-weight="700" letter-spacing="-3">Sornio</text></svg>\n`);

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-512-maskable.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(Buffer.from(icon)).resize(size, size).flatten({ background: '#0D1117' }).removeAlpha().png().toFile(path.join(output, name));
}

// A Windows ICO directory containing the same artwork at every launcher size.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(icon)).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const entry = 6 + i * 16;
  header[entry] = sizes[i] === 256 ? 0 : sizes[i];
  header[entry + 1] = sizes[i] === 256 ? 0 : sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
}
await fs.mkdir(path.join(root, 'desktop/windows'), { recursive: true });
await fs.writeFile(path.join(root, 'desktop/windows/Sornio.ico'), Buffer.concat([header, ...images]));
console.log('Built Sornio assets from the approved reference.');
