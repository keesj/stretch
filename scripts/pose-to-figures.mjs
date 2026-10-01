#!/usr/bin/env node
/**
 * Convert BlazePose captures (src/data/poses/*.json) into TSX figure snippets
 * for StretchAnimation.tsx.
 *
 * Usage: node scripts/pose-to-figures.mjs
 *
 * For each capture it:
 *  - picks the visible side of every joint pair (by visibility)
 *  - flips the figure so it faces right (our convention) when it faces left
 *  - projects the joints onto the 200x140 viewBox, scaled to fit with the
 *    lowest point on the floor line (y=126) and the figure centered
 *  - prints <Limb>/<Head> snippets ready to paste into a figure component
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(fileURLToPath(new URL("..", import.meta.url)), "src", "data", "poses");

// BlazePose 33-keypoint indices
const I = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT: 31,
  RIGHT_FOOT: 32,
};

const PAIRS = [
  ["ear", I.LEFT_EAR, I.RIGHT_EAR],
  ["shoulder", I.LEFT_SHOULDER, I.RIGHT_SHOULDER],
  ["elbow", I.LEFT_ELBOW, I.RIGHT_ELBOW],
  ["wrist", I.LEFT_WRIST, I.RIGHT_WRIST],
  ["hip", I.LEFT_HIP, I.RIGHT_HIP],
  ["knee", I.LEFT_KNEE, I.RIGHT_KNEE],
  ["ankle", I.LEFT_ANKLE, I.RIGHT_ANKLE],
  ["heel", I.LEFT_HEEL, I.RIGHT_HEEL],
  ["foot", I.LEFT_FOOT, I.RIGHT_FOOT],
];

const MIN_VIS = 0.5;

function visible(k) {
  return k && k.x != null && k.visibility > MIN_VIS;
}

function pickSide(kps, left, right) {
  const l = kps[left];
  const r = kps[right];
  if (visible(l) && visible(r)) return l.visibility >= r.visibility ? l : r;
  if (visible(l)) return l;
  if (visible(r)) return r;
  return null;
}

function limb(a, b, label) {
  return `      <Limb x1={${Math.round(a.x)}} y1={${Math.round(a.y)}} x2={${Math.round(b.x)}} y2={${Math.round(b.y)}} /> // ${label}`;
}

const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];

if (files.length === 0) {
  console.log(`No captures found in ${dir}. Export them from pose-tool.html first.`);
  process.exit(0);
}

for (const file of files) {
  const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const kps = data.keypoints;

  // Which side faces the camera, and which way the person faces
  const shoulder = pickSide(kps, I.LEFT_SHOULDER, I.RIGHT_SHOULDER);
  const hip = pickSide(kps, I.LEFT_HIP, I.RIGHT_HIP);
  const anchor = shoulder ?? hip;
  if (!anchor || !visible(kps[I.NOSE])) {
    console.warn(`! ${file}: shoulder/hip/nose not detected — capture is unusable, re-shoot.`);
    continue;
  }
  const facingLeft = kps[I.NOSE].x < anchor.x;

  const raw = {};
  for (const [name, l, r] of PAIRS) raw[name] = pickSide(kps, l, r);
  raw.nose = visible(kps[I.NOSE]) ? kps[I.NOSE] : null;

  const pts = {};
  const missing = [];
  for (const [name, p] of Object.entries(raw)) {
    if (!p) {
      missing.push(name);
      continue;
    }
    pts[name] = { x: facingLeft ? 1 - p.x : p.x, y: p.y };
  }
  for (const name of ["shoulder", "hip", "knee", "ankle"]) {
    if (!pts[name]) console.warn(`! ${data.exercise}: missing ${name} — segment will be skipped.`);
  }

  // Project onto the 200x140 viewBox: fit to x[14,186], y[18,126] (top band
  // reserved for the head circle above the nose), floor at 126, centered.
  const xs = Object.values(pts).map((p) => p.x);
  const ys = Object.values(pts).map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(172 / (maxX - minX || 1), 108 / (maxY - minY || 1), 350);
  const cx = (minX + maxX) / 2;
  const project = (p) => ({
    x: 100 + (p.x - cx) * scale,
    y: 126 - (maxY - p.y) * scale,
  });

  const P = {};
  for (const [name, p] of Object.entries(pts)) P[name] = project(p);

  console.log(`\n=== ${data.exercise} (${file}, ${data.framesUsed} frames, ${facingLeft ? "flipped" : "as-filmed"}) ===`);
  const lines = [];
  if (P.shoulder && P.hip) lines.push(limb(P.shoulder, P.hip, "torso"));
  if (P.shoulder && P.elbow) lines.push(limb(P.shoulder, P.elbow, "upper arm"));
  if (P.elbow && P.wrist) lines.push(limb(P.elbow, P.wrist, "forearm"));
  if (P.hip && P.knee) lines.push(limb(P.hip, P.knee, "thigh"));
  if (P.knee && P.ankle) lines.push(limb(P.knee, P.ankle, "shin"));
  if (P.heel && P.foot) lines.push(limb(P.heel, P.foot, "foot"));
  else if (P.ankle && P.foot) lines.push(limb(P.ankle, P.foot, "foot"));

  // Head: midpoint of nose and ear (the nose/ear line runs through the head center)
  if (P.nose && P.ear) {
    P.head = { x: (P.nose.x + P.ear.x) / 2, y: (P.nose.y + P.ear.y) / 2 - 4 };
  } else if (P.nose) {
    P.head = { x: P.nose.x, y: P.nose.y - 6 };
  }
  if (P.head) lines.push(`      <Head cx={${Math.round(P.head.x)}} cy={${Math.round(P.head.y)}} />`);

  console.log(lines.join("\n"));
  if (missing.length > 0) console.warn(`  (low-visibility joints skipped: ${missing.join(", ")})`);
}
