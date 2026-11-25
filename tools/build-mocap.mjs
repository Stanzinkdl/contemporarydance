// Converts CMU Graphics Lab motion capture (ASF skeleton + AMC motion) into
// compact JSON clips for the "recorded dancer" view.
//
//   node tools/build-mocap.mjs <rawDir> public/mocap
//
// Source data: CMU Graphics Lab Motion Capture Database, http://mocap.cs.cmu.edu/
// "The data used in this project was obtained from mocap.cs.cmu.edu.
//  The database was created with funding from NSF EIA-0196217."
// Download e.g. http://mocap.cs.cmu.edu/subjects/05/05.asf and 05_02.amc.

import fs from 'fs';
import path from 'path';

const [rawDir, outDir] = process.argv.slice(2);

const CLIPS = [
  { id: '05_02', asf: '05', title: 'Expressive arms and pirouette', note: 'Subject 5 (modern dance), trial 2' },
  { id: '05_04', asf: '05', title: 'Sideways arabesque, folding arms, bending back', note: 'Subject 5 (modern dance), trial 4' },
  { id: '49_10', asf: '49', title: 'Fold in from side arabesque, curl inwards', note: 'Subject 49 (modern dance), trial 10' },
  { id: '49_12', asf: '49', title: 'Lean forward, bring back leg forward, arching arms', note: 'Subject 49 (modern dance), trial 12' },
  { id: '49_22', asf: '49', title: 'Lean back on bent leg, balance, elbow by ear', note: 'Subject 49 (modern dance), trial 22' },
];
const SRC_FPS = 120;
const FPS = 30;
// CMU lengths are in inches × 0.45 ("length 0.45" in the ASF units block).
const TO_M = (1 / 0.45) * 0.0254;

function parseAsf(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const bones = [{ name: 'root', dof: ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'], dir: [0, 0, 0], len: 0, axis: [0, 0, 0], parent: null }];
  const hierarchy = [];
  let section = '';
  let cur = null;
  for (const l of lines) {
    if (l.startsWith(':')) {
      section = l.split(/\s+/)[0];
      continue;
    }
    if (section === ':bonedata') {
      const [k, ...v] = l.split(/\s+/);
      if (k === 'begin') cur = { dof: [] };
      else if (k === 'end') bones.push(cur);
      else if (k === 'name') cur.name = v[0];
      else if (k === 'direction') cur.dir = v.map(Number);
      else if (k === 'length') cur.len = Number(v[0]) * TO_M;
      else if (k === 'axis') cur.axis = v.slice(0, 3).map(Number);
      else if (k === 'dof') cur.dof = v;
    } else if (section === ':hierarchy') {
      if (l === 'begin' || l === 'end') continue;
      hierarchy.push(l.split(/\s+/));
    }
  }
  const byName = new Map(bones.map((b) => [b.name, b]));
  for (const [parent, ...kids] of hierarchy) for (const k of kids) byName.get(k).parent = parent;
  return bones;
}

function parseAmc(text, bones) {
  const frames = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#') || l.startsWith(':')) continue;
    if (/^\d+$/.test(l)) {
      cur = {};
      frames.push(cur);
      continue;
    }
    const [name, ...vals] = l.split(/\s+/);
    cur[name] = vals.map(Number);
  }
  // Flatten each frame in bone order; translations to metres.
  return frames.map((f) =>
    bones.flatMap((b) => {
      const v = f[b.name] || b.dof.map(() => 0);
      return b.dof.map((d, i) => (d.startsWith('t') ? +(v[i] * TO_M).toFixed(4) : +v[i].toFixed(1)));
    })
  );
}

fs.mkdirSync(outDir, { recursive: true });
const index = [];
for (const c of CLIPS) {
  const bones = parseAsf(fs.readFileSync(path.join(rawDir, `${c.asf}.asf`), 'utf8'));
  const all = parseAmc(fs.readFileSync(path.join(rawDir, `${c.id}.amc`), 'utf8'), bones);
  const frames = all.filter((_, i) => i % (SRC_FPS / FPS) === 0);
  const clip = {
    ...c,
    fps: FPS,
    bones: bones.map((b) => ({ name: b.name, parent: b.parent, dof: b.dof, dir: b.dir, len: +b.len.toFixed(4), axis: b.axis })),
    frames,
  };
  fs.writeFileSync(path.join(outDir, `${c.id}.json`), JSON.stringify(clip));
  index.push({ id: c.id, title: c.title, note: c.note, seconds: +(frames.length / FPS).toFixed(1) });
  console.log(c.id, frames.length, 'frames', (frames.length / FPS).toFixed(1) + 's');
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ source: 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), NSF EIA-0196217', clips: index }));
