#!/usr/bin/env node
// Derives ios/LoudLight/Assets.xcassets/AppIcon.appiconset/AppIcon.png from the
// repo's icon.png.
//
// Why a derivation rather than just copying the file: icon.png has its rounded
// corners baked in, painted over WHITE. iOS applies its own superellipse mask to
// every app icon, so shipping that verbatim puts four white wedges around a navy
// icon on the home screen — Apple's own guidance is a full-bleed square with no
// rounded corners and no alpha, and this is exactly why.
//
// So: find the baked radius, and for every pixel outside the rounded rect,
// substitute the nearest pixel that IS inside it (projected radially onto the
// corner arc). That extends the background gradient into the corners instead of
// flat-filling them, so the join is invisible even though the ground is not a
// single colour.
//
//   node ios/tools/make-icon.mjs

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "icon.png";
const OUT = "ios/LoudLight/Assets.xcassets/AppIcon.appiconset/AppIcon.png";

// ── decode (8-bit truecolour only, which is what icon.png is) ───────────────
function decodePNG(file) {
  const d = readFileSync(file);
  let p = 8, idat = [], ihdr = null;
  while (p < d.length) {
    const len = d.readUInt32BE(p), type = d.toString("ascii", p + 4, p + 8);
    const body = d.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") ihdr = { w: body.readUInt32BE(0), h: body.readUInt32BE(4), bd: body[8], ct: body[9] };
    if (type === "IDAT") idat.push(body);
    if (type === "IEND") break;
    p += 12 + len;
  }
  if (!ihdr) throw new Error(`${file}: no IHDR`);
  if (ihdr.bd !== 8 || ihdr.ct !== 2) {
    throw new Error(`${file}: expected 8-bit RGB with no alpha, got depth=${ihdr.bd} colourType=${ihdr.ct}. ` +
                    `An app icon may not carry an alpha channel — re-export it flattened.`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const { w, h } = ihdr, bpp = 3, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const x = line[i];
      let v;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: throw new Error("bad PNG filter type " + ft);
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, stride, data: out };
}

// ── encode ─────────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return (buf) => { let c = -1; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
};
function encodePNG(w, h, rgb) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── square off the baked corners ───────────────────────────────────────────
const img = decodePNG(SRC);
const { w, h, stride, data } = img;
if (w !== h) throw new Error(`${SRC} must be square, got ${w}x${h}`);
if (w < 1024) throw new Error(`${SRC} must be at least 1024px, got ${w}`);

const at = (x, y) => { const o = y * stride + x * 3; return [data[o], data[o + 1], data[o + 2]]; };
const isCornerFill = (x, y) => { const [r, g, b] = at(x, y); return r > 235 && g > 235 && b > 235; };

// The radius is where the top row stops being corner-fill.
let radius = 0;
while (radius < w / 2 && isCornerFill(radius, 0)) radius++;
if (radius === 0) {
  console.log("No baked corner found — copying through unchanged.");
} else if (radius > w / 3) {
  throw new Error(`Detected an implausible corner radius of ${radius}px; refusing to guess.`);
}

// Driven by the actual pixels rather than by an assumed circle: the baked
// corner's edge is anti-aliased and not a clean arc, so any radius-based test
// leaves a hairline white rim that is invisible at 1024px and obvious on a home
// screen. Instead, every near-white pixel inside a corner box is replaced by
// walking inward along the ray to the corner's arc centre until the walk
// reaches solid background, and copying that. The corner boxes contain nothing
// but background in this artwork — the bulb's own highlights are nowhere near
// them — so "near-white in a corner box" is an exact description of the thing
// being removed.
const WHITE = 200;   // lum above this in a corner box is baked corner, not art
const SOLID = 100;   // lum below this is unambiguously the navy ground
const lumAt = (buf, x, y) => { const o = y * stride + x * 3; return (buf[o] + buf[o + 1] + buf[o + 2]) / 3; };

const out = Buffer.from(data);
let filled = 0;
if (radius > 0) {
  // The scanned box and the verified box below are deliberately the SAME
  // region. When they differed, the arc's tangent points fell inside the check
  // and outside the fill, and eight white pixels survived into the output.
  const BOX = radius + 20;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  for (const [ox, oy] of corners) {
    // Fit the background as a plane (c = a·x + b·y + d, per channel) from the
    // solid pixels in this corner box, then evaluate it where the white was.
    // The ground is a subtle radial gradient, so a flat fill would band and
    // per-pixel resampling of the nearest solid pixel streaks into a starburst
    // — each white pixel picks its source from a different distance along its
    // own ray. A plane is the smallest model that follows the gradient without
    // inventing structure.
    let n = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0, Syy = 0;
    const Sc = [0, 0, 0], Sxc = [0, 0, 0], Syc = [0, 0, 0];
    for (let dy = 0; dy < BOX; dy++) {
      for (let dx = 0; dx < BOX; dx++) {
        const x = ox ? ox - dx : dx, y = oy ? oy - dy : dy;
        if (lumAt(data, x, y) > SOLID) continue;
        const o = y * stride + x * 3;
        n++; Sx += x; Sy += y; Sxx += x * x; Sxy += x * y; Syy += y * y;
        for (let k = 0; k < 3; k++) { Sc[k] += data[o + k]; Sxc[k] += x * data[o + k]; Syc[k] += y * data[o + k]; }
      }
    }
    if (!n) throw new Error("corner box had no background pixels to fit");
    // Solve the 3x3 normal equations by Cramer's rule.
    const M = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]];
    const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
                      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                      + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det3(M);
    const coef = [0, 1, 2].map((k) => {
      const rhs = [Sxc[k], Syc[k], Sc[k]];
      const col = (i) => det3(M.map((row, r) => row.map((v, c) => (c === i ? rhs[r] : v)))) / D;
      return [col(0), col(1), col(2)];
    });
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

    for (let dy = 0; dy < BOX; dy++) {
      for (let dx = 0; dx < BOX; dx++) {
        const x = ox ? ox - dx : dx, y = oy ? oy - dy : dy;
        if (lumAt(data, x, y) <= WHITE) continue;
        const o = y * stride + x * 3;
        for (let k = 0; k < 3; k++) out[o + k] = clamp(coef[k][0] * x + coef[k][1] * y + coef[k][2]);
        filled++;
      }
    }
  }

  // The corners are the whole point of this script; a leftover rim means the
  // detection missed and the icon must not ship.
  let left = 0;
  for (const [ox, oy] of corners)
    for (let dy = 0; dy < BOX; dy++)
      for (let dx = 0; dx < BOX; dx++) {
        const x = ox ? ox - dx : dx, y = oy ? oy - dy : dy;
        if (lumAt(out, x, y) > WHITE) left++;
      }
  if (left) {
    console.error(`!! ICON FAIL: ${left} near-white pixels still in the corners after squaring off.`);
    console.error("   iOS masks the icon itself, so these would show as white wedges on the home screen.");
    process.exit(1);
  }
}

const png = encodePNG(w, h, out);
writeFileSync(OUT, png);
console.log(`Wrote ${OUT} — ${w}x${w}, no alpha, ${Math.round(png.length / 1024)}KB` +
            (radius ? `; squared off a ${radius}px baked corner (${filled} px)` : ""));
