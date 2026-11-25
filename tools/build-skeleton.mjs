// Builds the anatomical skeleton used by the dancer from BodyParts3D.
//
//   node tools/build-skeleton.mjs <path/to/partof_BP3D_4.0_obj_99> public/skeleton
//   (writes public/skeleton/bones.bin and src/data/skeleton.json)
//
// Source data: BodyParts3D, © The Database Center for Life Science,
// licensed under CC BY 4.0 (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html).
// Download partof_BP3D_4.0_obj_99.zip from that site and unzip it.
//
// What it does:
//   1. Reads every bone OBJ and sorts it into a body segment (pelvis, thorax,
//      upper arm, …) by its anatomical name.
//   2. Finds joint centres from the bones themselves (e.g. the hip is the
//      centre of the femoral head) so the rig matches real anatomy.
//   3. Simplifies each bone, stores it relative to its segment's joint, and
//      writes a compact binary (Int16 positions, Uint16 indices) plus JSON.

import fs from 'fs';
import path from 'path';
import { MeshoptSimplifier } from 'meshoptimizer';

const [objDir, outDir] = process.argv.slice(2);
if (!objDir || !outDir) {
  console.error('usage: node tools/build-skeleton.mjs <objDir> <outDir>');
  process.exit(1);
}
await MeshoptSimplifier.ready;

// ---------------------------------------------------------------------------
// 1. Classify bones into segments
// ---------------------------------------------------------------------------
// [segment, pattern, material]. Order matters: disks before vertebrae.
const RULES = [
  ['neck', /^intervertebral disk of (axis|(third|fourth|fifth|sixth|seventh) cervical vertebra)$/, 'cart'],
  ['thorax', /^intervertebral disk of \w+ thoracic vertebra$/, 'cart'],
  ['lumbar', /^intervertebral disk of \w+ lumbar vertebra$/, 'cart'],
  ['head', /^(frontal bone|(left|right) parietal bone|occipital bone|(left|right) temporal bone|sphenoid bone|(left|right) maxilla|(left|right) zygomatic bone|(left|right) nasal bone|mandible|hyoid bone)$/],
  ['neck', /^(atlas|axis|(third|fourth|fifth|sixth|seventh) cervical vertebra)$/],
  ['thorax', /(thoracic vertebra|^(left|right) \w+ rib|^body of sternum|^manubrium|^xiphoid process|clavicle|scapula)$/],
  ['thorax', /costal cartilage$/, 'cart'],
  ['lumbar', /lumbar vertebra$/],
  ['pelvis', /(hip bone|^sacrum|coccyx)$/],
  ['upperArm', /humerus$/],
  ['foreArm', /(radius|ulna)$/],
  ['hand', /(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal bone|phalanx of .*(thumb|finger))$/],
  ['thigh', /femur$/],
  ['shin', /(tibia|fibula|patella)$/],
  ['foot', /(talus|calcaneus|navicular bone of (left|right) foot|cuneiform bone|cuboid bone|metatarsal bone|phalanx of .*toe)$/],
];
const SIDED = new Set(['upperArm', 'foreArm', 'hand', 'thigh', 'shin', 'foot']);

function classify(name) {
  const n = name.toLowerCase();
  for (const [seg, re, mat = 'bone'] of RULES) {
    if (!re.test(n)) continue;
    if (!SIDED.has(seg)) return { seg, mat };
    if (/\bleft\b/.test(n)) return { seg: seg + 'L', mat };
    if (/\bright\b/.test(n)) return { seg: seg + 'R', mat };
  }
  return null;
}

// BodyParts3D: millimetres, x = body's left, y = backward (front is −y), z = up.
// Ours (three.js): metres, x = body's left, y = up, z = forward.
function readObj(file) {
  const text = fs.readFileSync(file, 'utf8');
  const name = (text.match(/# English name : (.*)/) || [])[1]?.trim();
  const pos = [];
  const idx = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      pos.push(x / 1000, z / 1000, -y / 1000);
    } else if (line.startsWith('f ')) {
      const f = line.trim().split(/\s+/).slice(1).map((s) => parseInt(s, 10) - 1);
      for (let i = 1; i < f.length - 1; i++) idx.push(f[0], f[i], f[i + 1]);
    }
  }
  return { name, pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}

const parts = [];
const seen = new Set();
for (const f of fs.readdirSync(objDir).filter((f) => f.endsWith('.obj'))) {
  const head = fs.readFileSync(path.join(objDir, f), 'utf8').slice(0, 2000);
  const name = (head.match(/# English name : (.*)/) || [])[1]?.trim();
  if (!name || seen.has(name)) continue;
  const cls = classify(name);
  if (!cls) continue;
  seen.add(name);
  parts.push({ ...cls, ...readObj(path.join(objDir, f)) });
}
const byName = new Map(parts.map((p) => [p.name.toLowerCase(), p]));
console.log(`bones: ${parts.length}`);

// ---------------------------------------------------------------------------
// 2. Landmarks and joint centres
// ---------------------------------------------------------------------------
const pts = (...names) => {
  const out = [];
  for (const n of names) {
    const p = byName.get(n.toLowerCase());
    if (!p) throw new Error(`missing bone: ${n}`);
    for (let i = 0; i < p.pos.length; i += 3) out.push([p.pos[i], p.pos[i + 1], p.pos[i + 2]]);
  }
  return out;
};
const centroid = (P) => P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length, a[2] + p[2] / P.length], [0, 0, 0]);
const maxY = (P) => Math.max(...P.map((p) => p[1]));
const minY = (P) => Math.min(...P.map((p) => p[1]));
const top = (P, t) => { const m = maxY(P); return P.filter((p) => p[1] > m - t); };
const bottom = (P, t) => { const m = minY(P); return P.filter((p) => p[1] < m + t); };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// Centre of a ball-shaped joint head: the medial-most cap of the bone's top.
function headCentre(P, depth, radius) {
  const cap = top(P, depth);
  const m = Math.min(...cap.map((p) => Math.abs(p[0])));
  return centroid(cap.filter((p) => Math.abs(p[0]) < m + radius * 2));
}

const J = {};
for (const [s, side] of [['L', 'left'], ['R', 'right']]) {
  const femur = pts(`${side} femur`);
  const tibia = pts(`${side} tibia`);
  const humerus = pts(`${side} humerus`);
  J[`hip${s}`] = headCentre(femur, 0.06, 0.022);
  J[`knee${s}`] = mid(centroid(bottom(femur, 0.025)), centroid(top(tibia, 0.025)));
  J[`ankle${s}`] = centroid(pts(`${side} talus`));
  J[`shoulder${s}`] = headCentre(humerus, 0.05, 0.022);
  J[`elbow${s}`] = centroid(bottom(humerus, 0.03));
  J[`wrist${s}`] = centroid(pts(`${side} lunate`, `${side} scaphoid`, `${side} capitate`));
  J[`handTip${s}`] = centroid(pts(`proximal phalanx of ${side} middle finger`));
  J[`toe${s}`] = centroid(pts(`proximal phalanx of ${side} second toe`));
}
J.lumbosacral = centroid(pts('intervertebral disk of fifth lumbar vertebra'));
J.thoracolumbar = mid(centroid(pts('intervertebral disk of eleventh thoracic vertebra')), centroid(pts('intervertebral disk of first lumbar vertebra')));
J.cervicothoracic = centroid(pts('intervertebral disk of seventh cervical vertebra'));
J.atlanto = (([x, y, z]) => [x, y + 0.01, z])(centroid(pts('atlas')));
J.skullTop = [0, maxY(pts('frontal bone', 'left parietal bone', 'right parietal bone')), 0];
J.midHip = mid(J.hipL, J.hipR);

// Put the soles on the floor and centre the body over its hips.
const floor = Math.min(...parts.filter((p) => p.seg.startsWith('foot')).map((p) => minY(pts(p.name))));
const shift = [-J.midHip[0], -floor, -J.midHip[2]];
for (const k of Object.keys(J)) J[k] = [J[k][0] + shift[0], J[k][1] + shift[1], J[k][2] + shift[2]];
for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) { p.pos[i] += shift[0]; p.pos[i + 1] += shift[1]; p.pos[i + 2] += shift[2]; }
console.log('height (m):', J.skullTop[1].toFixed(3));

// Each segment: the joint it rotates about, and the joint it points to (rest axis).
const SEGMENTS = {
  pelvis: ['midHip', 'lumbosacral'],
  lumbar: ['lumbosacral', 'thoracolumbar'],
  thorax: ['thoracolumbar', 'cervicothoracic'],
  neck: ['cervicothoracic', 'atlanto'],
  head: ['atlanto', 'skullTop'],
};
for (const s of ['L', 'R']) {
  Object.assign(SEGMENTS, {
    [`upperArm${s}`]: [`shoulder${s}`, `elbow${s}`],
    [`foreArm${s}`]: [`elbow${s}`, `wrist${s}`],
    [`hand${s}`]: [`wrist${s}`, `handTip${s}`],
    [`thigh${s}`]: [`hip${s}`, `knee${s}`],
    [`shin${s}`]: [`knee${s}`, `ankle${s}`],
    [`foot${s}`]: [`ankle${s}`, `toe${s}`],
  });
}

// ---------------------------------------------------------------------------
// 3. Simplify, localise, quantise, write
// ---------------------------------------------------------------------------
// Detail budget per bone. Big, visible bones keep up to 1500 triangles;
// small ones (vertebrae, disks, finger and toe bones) up to 240; very dense
// meshes (ribs, scapulae, skull plates) are cut to ~10%.
const DETAILED = /(femur|tibia|humerus|radius|ulna|hip bone|sacrum|mandible|scapula|clavicle|frontal bone|parietal|occipital|temporal|maxilla|zygomatic)$/;
function simplify(p) {
  const tris = p.idx.length / 3;
  const cap = DETAILED.test(p.name.toLowerCase()) ? 1500 : 240;
  const target = Math.round(Math.max(Math.min(tris, cap), tris * 0.1)) * 3;
  if (target >= p.idx.length) return { pos: [...p.pos], idx: p.idx };
  const [idx] = MeshoptSimplifier.simplify(p.idx, p.pos, 3, target, 0.02);
  // Drop vertices no longer referenced.
  const remap = new Int32Array(p.pos.length / 3).fill(-1);
  const pos = [];
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let r = remap[idx[i]];
    if (r < 0) {
      r = remap[idx[i]] = pos.length / 3;
      pos.push(p.pos[idx[i] * 3], p.pos[idx[i] * 3 + 1], p.pos[idx[i] * 3 + 2]);
    }
    out[i] = r;
  }
  return { pos, idx: out };
}

const DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) DIRS.push([x, y, z]);

const entries = [];
const chunks = [];
let offset = 0;
let totalTris = 0;
for (const [seg, [from, to]] of Object.entries(SEGMENTS)) {
  const origin = J[from];
  for (const mat of ['bone', 'cart']) {
    const group = parts.filter((p) => p.seg === seg && p.mat === mat);
    if (!group.length) continue;
    const pos = [];
    const idx = [];
    for (const p of group) {
      const s = simplify(p);
      const base = pos.length / 3;
      for (let i = 0; i < s.pos.length; i += 3) pos.push(s.pos[i] - origin[0], s.pos[i + 1] - origin[1], s.pos[i + 2] - origin[2]);
      for (const i of s.idx) idx.push(i + base);
    }
    const n = pos.length / 3;
    if (n > 65535) throw new Error(`${seg}/${mat}: too many vertices (${n})`);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) {
      min[i % 3] = Math.min(min[i % 3], pos[i]);
      max[i % 3] = Math.max(max[i % 3], pos[i]);
    }
    const scale = max.map((m, k) => (m - min[k]) || 1e-6);
    const q = new Int16Array(pos.length);
    for (let i = 0; i < pos.length; i++) q[i] = Math.round(((pos[i] - min[i % 3]) / scale[i % 3]) * 65535) - 32768;
    const ind = new Uint16Array(idx);
    // Extreme points in 26 directions: used to keep the body on the floor.
    const contacts = [];
    if (mat === 'bone') {
      for (const d of DIRS) {
        let best = -Infinity;
        let bi = 0;
        for (let i = 0; i < n; i++) {
          const v = pos[i * 3] * d[0] + pos[i * 3 + 1] * d[1] + pos[i * 3 + 2] * d[2];
          if (v > best) { best = v; bi = i; }
        }
        const c = [pos[bi * 3], pos[bi * 3 + 1], pos[bi * 3 + 2]].map((v) => +v.toFixed(4));
        if (!contacts.some((o) => o.every((v, k) => v === c[k]))) contacts.push(c);
      }
    }
    const posBytes = Buffer.from(q.buffer);
    const idxBytes = Buffer.from(ind.buffer);
    const pad = Buffer.alloc((4 - ((posBytes.length + idxBytes.length) % 4)) % 4);
    entries.push({
      seg, mat, vertices: n, indices: ind.length,
      posOffset: offset, idxOffset: offset + posBytes.length,
      min: min.map((v) => +v.toFixed(5)), scale: scale.map((v) => +v.toFixed(5)),
      contacts,
    });
    chunks.push(posBytes, idxBytes, pad);
    offset += posBytes.length + idxBytes.length + pad.length;
    totalTris += ind.length / 3;
  }
}

const round = (v) => v.map((x) => +x.toFixed(4));
const joints = Object.fromEntries(Object.entries(J).map(([k, v]) => [k, round(v)]));
const segments = Object.fromEntries(
  Object.entries(SEGMENTS).map(([seg, [from, to]]) => [seg, { joint: from, origin: joints[from], axis: round(sub(J[to], J[from])) }])
);

// The binary mesh goes to public/ (fetched at runtime); the small JSON with
// joints, segments and contact points is bundled with the code.
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'bones.bin'), Buffer.concat(chunks));
fs.writeFileSync(
  new URL('../src/data/skeleton.json', import.meta.url),
  JSON.stringify({
    source: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
    units: 'metres; x = body left, y = up, z = forward; floor at y = 0',
    joints,
    segments,
    entries,
  })
);
console.log(`segments: ${Object.keys(SEGMENTS).length}, entries: ${entries.length}, triangles: ${totalTris}, bytes: ${offset}`);
