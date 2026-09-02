/**
 * Generates the app icon files from one description of the mark.
 *
 *   public/favicon.svg   browser tab (vector, hand-written — the source of truth)
 *   public/app-icon.png  256px, for anything that wants a plain image
 *   public/app-icon.ico  multi-size Windows icon for the desktop shortcut
 *
 * The raster files are generated rather than committed as opaque binaries, so the
 * mark can be changed in one place and the icons regenerated:  `node scripts/make-icons.mjs`
 *
 * No image dependency: the mark is a handful of circles and two lines, so it is
 * rasterised here with 4x supersampling and encoded as PNG using Node's own zlib.
 * An .ico may embed PNGs directly, which keeps this to a header and an index.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// ---------- the mark ----------
//
// An orchestrator over two specialists: what the app draws, in the SPEC §6 kind
// colours. Coordinates are fractions of the icon, so every size is the same shape.
// Deliberately NOT a redrawn Solarlux logo — the real wordmark is a corporate asset
// and is used as supplied (see src/views/chrome/Brand.tsx), never traced by hand.

const BG = [0x05, 0x06, 0x0f];
const GLOW = [0x0d, 0x13, 0x30];
const ORCHESTRATOR = [0x8b, 0x5c, 0xf6];
const DEPARTMENT = [0x38, 0xe1, 0xff];
const WORKER = [0x3c, 0xe8, 0xb0];

const ROOT = { x: 0.5, y: 0.34, r: 0.15 };
const LEFT = { x: 0.27, y: 0.71, r: 0.108 };
const RIGHT = { x: 0.73, y: 0.71, r: 0.108 };
const LINK_WIDTH = 0.042;
const CORNER = 0.22;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Inside a rounded square covering the whole tile — the usual rounded-box
 * distance: push the point outside the straight edges, and only the part that
 * escapes on BOTH axes at once is a corner to be rounded.
 */
function inRoundedSquare(x, y) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - CORNER), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - CORNER), 0);
  return Math.hypot(dx, dy) <= CORNER;
}

const inCircle = (x, y, c) => Math.hypot(x - c.x, y - c.y) <= c.r;

/** Distance from a point to a segment, for the links. */
function inSegment(x, y, a, b, width) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const t = clamp01(((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy));
  return Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t)) <= width / 2;
}

/** Colour of one sample point, or null where the tile is transparent. */
function sample(x, y) {
  if (!inRoundedSquare(x, y)) return null;

  // Background, with a soft glow lifting the centre the way the app's canvas does.
  const glow = clamp01(1 - Math.hypot(x - 0.5, y - 0.42) / 0.62) ** 2;
  let colour = BG.map((c, i) => c + (GLOW[i] - c) * glow);

  // Links sit under the nodes so the nodes read as solid.
  if (inSegment(x, y, ROOT, LEFT, LINK_WIDTH) || inSegment(x, y, ROOT, RIGHT, LINK_WIDTH)) {
    colour = colour.map((c, i) => c + (DEPARTMENT[i] - c) * 0.5);
  }

  if (inCircle(x, y, ROOT)) colour = ORCHESTRATOR;
  else if (inCircle(x, y, LEFT)) colour = DEPARTMENT;
  else if (inCircle(x, y, RIGHT)) colour = WORKER;

  return colour;
}

/** RGBA pixels for one size, 4x supersampled so small sizes stay clean. */
function render(size) {
  const SS = 4;
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const found = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (!found) continue;
          r += found[0];
          g += found[1];
          b += found[2];
          hits += 1;
        }
      }

      const total = SS * SS;
      const offset = (py * size + px) * 4;
      if (hits === 0) continue;
      // Premultiplied-free: average the colour over covered samples, alpha over all.
      pixels[offset] = Math.round(r / hits);
      pixels[offset + 1] = Math.round(g / hits);
      pixels[offset + 2] = Math.round(b / hits);
      pixels[offset + 3] = Math.round((hits / total) * 255);
    }
  }
  return pixels;
}

// ---------- PNG ----------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  // 10-12: deflate, adaptive filtering, no interlace — all zero.

  // One filter byte (0 = none) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- ICO ----------

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach(({ size, png }, index) => {
    const at = index * 16;
    // 256 is stored as 0 — the field is one byte.
    directory[at] = size >= 256 ? 0 : size;
    directory[at + 1] = size >= 256 ? 0 : size;
    directory[at + 2] = 0; // palette
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32BE(0, at + 8);
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
}

// ---------- write ----------

mkdirSync(OUT, { recursive: true });

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const entries = SIZES.map((size) => ({ size, png: encodePng(render(size), size) }));

writeFileSync(join(OUT, 'app-icon.ico'), encodeIco(entries));
writeFileSync(join(OUT, 'app-icon.png'), entries[entries.length - 1].png);

console.log(`app-icon.ico  ${SIZES.join(', ')} px`);
console.log(`app-icon.png  256 px`);
