#!/usr/bin/env node
// Generates ios/Tabula/Assets.xcassets/AppIcon.appiconset/AppIcon.png.
//
// The web app's icon.svg is a Georgia-bold "T" on the Tabula ground. There is no
// SVG rasteriser in the build environment (and adding one would be a native
// dependency for a single 1024px square), so the same mark is drawn here as
// axis-aligned rectangles straight into a PNG. Every edge is on a pixel
// boundary, so there is nothing for anti-aliasing to do and the output is
// identical to what a rasteriser would produce.
//
// Apple's rules for the marketing icon, which this satisfies by construction:
// 1024x1024, no alpha channel, square corners (the system applies the mask).
//
//   node ios/tools/make-icon.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const N = 1024;
const BG = [0x1a, 0x18, 0x14]; // #1a1814 — the app's ground
const FG = [0xc4, 0xa8, 0x82]; // #c4a882 — the brass the glyph is drawn in

// The mark, in icon.svg's 96-unit box, so it stays comparable with the source.
const K = N / 96;

// The web icon draws its own rounded rect and leaves room around the glyph for
// it. iOS applies its own mask, so that margin is dead space here — the mark is
// scaled up about the centre to fill the square the way a home-screen icon
// should. SHIFT_Y nudges it down a touch: a T carries its weight in the
// crossbar, so a geometrically centred one reads as sitting high.
const SCALE = 1.5;
const SHIFT_Y = 1;
const u = (v) => Math.round(v * K);
const tx = (v) => u(48 + (v - 48) * SCALE);
const ty = (v) => u(48 + (v - 48) * SCALE + SHIFT_Y);
const RECTS = [
  [32.5, 30, 63.5, 36],  // crossbar
  [32.5, 36, 35.5, 41],  // left crossbar serif
  [60.5, 36, 63.5, 41],  // right crossbar serif
  [44.5, 30, 51.5, 62],  // stem
  [38.0, 62, 58.0, 66],  // foot serif
].map(([x0, y0, x1, y1]) => [tx(x0), ty(y0), tx(x1), ty(y1)]);

// Raw scanlines: one filter byte (0 = None) then RGB triples.
const stride = 1 + N * 3;
const raw = Buffer.alloc(stride * N);
for (let y = 0; y < N; y++) {
  const row = y * stride;
  raw[row] = 0;
  for (let x = 0; x < N; x++) {
    const on = RECTS.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
    const c = on ? FG : BG;
    const p = row + 1 + x * 3;
    raw[p] = c[0]; raw[p + 1] = c[1]; raw[p + 2] = c[2];
  }
}

// Minimal PNG writer. Colour type 2 = truecolour, no alpha.
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // colour type: truecolour
ihdr[10] = 0; // deflate
ihdr[11] = 0; // adaptive filtering
ihdr[12] = 0; // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = "ios/Tabula/Assets.xcassets/AppIcon.appiconset/AppIcon.png";
writeFileSync(out, png);
console.log(`Wrote ${out} (${N}x${N}, ${Math.round(png.length / 1024)}KB, no alpha)`);
