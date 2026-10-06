// Generates the PWA PNG icons without any image dependencies.
// Usage: node scripts/generate-icons.mjs
// Outputs: public/pwa-192.png, public/pwa-512.png, public/apple-touch-icon.png
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// App palette
const BG = [0xfa, 0xf5, 0xf0]; // calm-50
const RING = [0x02, 0x84, 0xc7]; // primary-600
const DOT = [0x8a, 0x76, 0x48]; // calm-600

/** Ring (donut) + small dot, anti-aliased with distance coverage. */
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const ringOuter = size * 0.34;
  const ringInner = size * 0.24;
  const dotR = size * 0.09;
  const dotY = c + size * 0.44;

  const blend = (out, rgb, t) => {
    for (let i = 0; i < 3; i++) {
      out[i] = Math.round(out[i] + (rgb[i] - out[i]) * t);
    }
    out[3] = 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      px[o] = BG[0];
      px[o + 1] = BG[1];
      px[o + 2] = BG[2];
      px[o + 3] = 255;

      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.sqrt(dx * dx + dy * dy);

      // Ring: 1 inside outer radius, 0 outside inner, smooth across the edge
      const tOuter = Math.min(Math.max((ringOuter - d + 0.75) / 1.5, 0), 1);
      const tInner = Math.min(Math.max((d - ringInner + 0.75) / 1.5, 0), 1);
      const ringT = tOuter * tInner;
      if (ringT > 0) blend(px.subarray(o, o + 4), RING, ringT);

      // Dot below the ring center
      const dd = Math.sqrt(dx * dx + (y + 0.5 - dotY) ** 2);
      const dotT = Math.min(Math.max((dotR - dd + 0.75) / 1.5, 0), 1);
      if (dotT > 0) blend(px.subarray(o, o + 4), DOT, dotT);
    }
  }
  return px;
}

const targets = [
  ["public/pwa-192.png", 192],
  ["public/pwa-512.png", 512],
  ["public/apple-touch-icon.png", 180],
];

for (const [file, size] of targets) {
  writeFileSync(file, encodePng(size, drawIcon(size)));
  console.log(`wrote ${file} (${size}x${size})`);
}
