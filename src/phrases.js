// Technique-specific movement phrases.
//
// Each technique dances a short phrase built from the exercises its classes
// actually use (Graham's seated breathings and pleadings, Horton's flat back
// and lateral T, Limón's swings and falls, Dunham's isolations and walks…).
// Moves are functions of the eight scores, so changing a number still changes
// how deep, how curved or how far off-balance each step is.
//
// Pose vocabulary (radians unless noted):
//   root.x / root.y / root.z   whole-body pitch / facing / roll, pivoting at the floor
//   travel.x / travel.z (m)    stepping away from the home spot
//   pelvis.x/y/z, pelvis.shift  pelvic tilt / turn / side tilt, side shift (m)
//   s1 (lumbar), s2 (lower thorax), s3 (upper chest), neck, head:
//       x = bend forward(+)/back(−), y = twist, z = side bend.
//       If a move gives s2 but not s3, the bend is shared across both.
//   arms: f = forward raise, a = side raise, t = rotation, e = elbow bend, w = wrist bend,
//         c = finger curl (0 open … 1.6 fist), sh = shoulder shrug, pr = shoulder reach forward
//   legs: f = hip flexion (knee forward), a = leg out to the side, t = turnout,
//         k = knee bend, p = point the foot (0 keeps the sole flat to the floor),
//         d = on half-toe (1 keeps the toes flat on the floor while the heel lifts)
//   lift (m)                    height of a jump
// "L" is the dancer's left (+x). A partner dances the mirror image.

export const KEYS = [
  'root.x', 'root.y', 'root.z', 'travel.x', 'travel.z',
  'pelvis.x', 'pelvis.y', 'pelvis.z', 'pelvis.shift',
  ...['s1', 's2', 's3', 'neck', 'head'].flatMap((g) => [`${g}.x`, `${g}.y`, `${g}.z`]),
  ...['armL', 'armR'].flatMap((g) => ['f', 'a', 't', 'e', 'w', 'c', 'sh', 'pr'].map((c) => `${g}.${c}`)),
  ...['legL', 'legR'].flatMap((g) => ['f', 'a', 't', 'k', 'p', 'd'].map((c) => `${g}.${c}`)),
  'shake', 'lift',
];
const DEFAULTS = Object.fromEntries(KEYS.map((k) => [k, 0]));
Object.assign(DEFAULTS, { 'armL.a': 0.05, 'armR.a': 0.05, 'armL.e': 0.15, 'armR.e': 0.15, 'armL.c': 0.35, 'armR.c': 0.35 });

export function normalize(spec) {
  const out = { ...DEFAULTS };
  for (const [group, comps] of Object.entries(spec)) {
    if (typeof comps === 'number') {
      out[group] = comps;
      continue;
    }
    const targets = group === 'arms' ? ['armL', 'armR'] : group === 'legs' ? ['legL', 'legR'] : [group];
    for (const t of targets) for (const [c, v] of Object.entries(comps)) out[`${t}.${c}`] = v;
  }
  // Share a thoracic bend between the lower thorax and upper chest.
  if (!spec.s3) for (const c of ['x', 'y', 'z']) {
    out[`s3.${c}`] = out[`s2.${c}`] * 0.5;
    out[`s2.${c}`] *= 0.5;
  }
  return out;
}

// Phrases added at runtime (e.g. one section of a class in the studio viewer).
export function registerPhrase(id, def) {
  PHRASES[id] = def;
}

const NEGATE_ON_MIRROR = [
  'root.y', 'root.z', 'travel.x', 'pelvis.y', 'pelvis.z', 'pelvis.shift',
  's1.y', 's1.z', 's2.y', 's2.z', 's3.y', 's3.z', 'neck.y', 'neck.z', 'head.y', 'head.z',
];
export function mirrorPose(P) {
  const out = { ...P };
  for (const k of KEYS) {
    if (k.startsWith('armL') || k.startsWith('legL')) {
      const other = k.replace('L.', 'R.');
      out[k] = P[other];
      out[other] = P[k];
    }
  }
  for (const k of NEGATE_ON_MIRROR) out[k] = -P[k];
  return out;
}

export function lerpPose(a, b, t) {
  const out = {};
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

// Score-driven amplitudes.
const T = (p) => 0.4 + 0.8 * p.torso; // spine articulation
const F = (p) => 0.4 + 0.8 * p.fall; // how far off balance
const soft = (p) => 0.06 + 0.4 * p.grounding; // resting knee bend
// Bend forward at the hips while the legs stay where they are.
const hinge = (a, legs = {}) => ({ pelvis: { x: a }, legs: { f: a, ...legs } });

// Graham's seated position: soles together, knees open, sitting on the floor.
const SEAT = { f: 1.45, a: 0.75, t: 1.25, k: 2.4 };

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------
export const MOVES = {
  // ---- Shared ----
  stand: {
    label: 'Stand',
    pose: (p) => ({ legs: { f: soft(p) / 2, k: soft(p) }, arms: { a: 0.1, f: 0.05, e: 0.2 }, s2: { x: -0.05 * (1 - p.grounding) } }),
  },
  plie2: {
    label: 'Second-position plié',
    pose: (p) => ({ legs: { f: 0.55, a: 0.42, t: 0.55, k: 1.05 + 0.3 * p.grounding }, arms: { a: 1.3, f: 0.2, e: 0.3, w: -0.2 } }),
  },
  releve: {
    label: 'Relevé',
    pose: () => ({ legs: { t: 0.5, p: 0.85, d: 1 }, arms: { f: 2.8, a: 0.3, e: 0.45, c: 0.2 }, s2: { x: -0.08 }, head: { x: -0.12 } }),
  },

  // ---- Graham ----
  gSeated: {
    label: 'Seated bounces',
    pose: (p) => ({
      legs: SEAT,
      s1: { x: 0.25 * T(p) }, s2: { x: 0.35 * T(p) }, neck: { x: 0.25 }, head: { x: 0.15 },
      arms: { f: 0.75, a: 0.35, e: 0.35 },
    }),
  },
  gBreathContract: {
    label: 'Breathing: contraction',
    pose: (p) => ({
      legs: SEAT,
      pelvis: { x: -0.15 * T(p) }, s1: { x: 0.45 * T(p) }, s2: { x: 0.4 * T(p) }, neck: { x: 0.3 * T(p) }, head: { x: 0.25 },
      arms: { f: 0.9, a: 0.55, e: 0.5, w: 0.3 },
    }),
  },
  gBreathRelease: {
    label: 'Breathing: release',
    pose: (p) => ({
      legs: SEAT,
      s1: { x: -0.05 }, s2: { x: -0.2 * T(p) }, neck: { x: -0.15 }, head: { x: -0.2 },
      arms: { f: 0.6, a: 1.0, e: 0.2 },
    }),
  },
  gSpiral: {
    label: 'Spiral in fourth',
    pose: (p) => ({
      legL: { f: 1.4, a: 0.55, t: 0.6, k: 2.35 }, legR: { f: 0.25, a: 1.0, t: -0.5, k: 2.3 },
      pelvis: { y: 0.1 }, s1: { y: 0.3 * T(p) }, s2: { y: 0.4 * T(p), x: -0.1 }, neck: { y: 0.2 }, head: { y: 0.15, x: -0.1 },
      armL: { f: 0.3, a: 1.35, e: 0.25 }, armR: { f: 1.35, a: 0.2, e: 0.45 },
    }),
  },
  gPleading: {
    label: 'Pleading on the knees',
    pose: (p) => ({
      // Thighs stay vertical over the knees while the pelvis tilts back.
      legs: { f: -0.25 * T(p), k: 1.6, p: 1.2 },
      pelvis: { x: -0.25 * T(p) }, s1: { x: 0.35 * T(p) }, s2: { x: 0.3 * T(p) }, neck: { x: -0.1 }, head: { x: -0.25 },
      arms: { f: 1.7, a: 0.25, e: 0.15, w: -0.3 },
    }),
  },
  contraction: {
    label: 'Standing contraction',
    pose: (p) => ({
      pelvis: { x: -0.2 * T(p) }, s1: { x: 0.4 * T(p) }, s2: { x: 0.4 * T(p) }, neck: { x: 0.25 * T(p) }, head: { x: 0.2 },
      arms: { f: 1.0, a: 0.4, e: 0.7, w: 0.3 }, legs: { f: 0.45, k: 0.95, t: 0.3 },
    }),
  },
  release: {
    label: 'High release',
    pose: (p) => ({
      pelvis: { x: -0.08 * T(p) }, s1: { x: -0.12 * T(p) }, s2: { x: -0.4 * T(p) }, neck: { x: -0.3 * T(p) }, head: { x: -0.25 },
      arms: { a: 2.15, f: -0.25, e: 0.3, w: -0.2 }, legs: { f: 0.3, k: 0.55, t: 0.3 },
    }),
  },
  spiralStand: {
    label: 'Standing spiral',
    pose: (p) => ({
      pelvis: { y: 0.15 }, s1: { y: 0.4 * T(p), x: 0.1 }, s2: { y: 0.45 * T(p) }, neck: { y: 0.25 }, head: { y: 0.15 },
      armL: { f: 1.2, a: 0.2, e: 0.9 }, armR: { f: 0.4, a: 1.1, e: 0.3 },
      legL: { f: 0.45, k: 0.85, t: 0.3 }, legR: { f: 0.35, k: 0.7, t: 0.3 },
    }),
  },

  // ---- Horton ----
  hFlatBack: {
    label: 'Flat back',
    pose: (p) => ({ ...hinge(1.45, { a: 0.18, k: 0.05 }), neck: { x: -0.1 }, head: { x: -0.2 }, arms: { f: 2.95, a: 0.12, e: 0.02 } }),
  },
  hLateral: {
    label: 'Lateral stretch',
    pose: () => ({
      legs: { a: 0.2, k: 0.05 }, s1: { z: 0.3 }, s2: { z: 0.35 }, neck: { z: 0.15 },
      armL: { a: 2.9, e: 0.1 }, armR: { a: 0.6, e: 0.4, f: 0.3 },
    }),
  },
  hLateralT: {
    label: 'Lateral T',
    pose: () => ({
      pelvis: { z: 1.35 }, legR: { a: 1.35, k: 0.05 }, legL: { a: 0.05, k: 0, p: 0.8 },
      arms: { a: 2.95, e: 0.02 }, head: { z: 0.1 },
    }),
  },
  hHinge: {
    label: 'Hinge',
    pose: () => ({ pelvis: { x: -0.55 }, legs: { f: 0.0, k: 1.15, p: 0.75, d: 1 }, arms: { f: 1.0, e: 0.05 }, head: { x: 0.25 } }),
  },
  hSquat: {
    label: 'Primitive squat',
    pose: () => ({ legs: { f: 1.95, a: 0.18, k: 2.35 }, pelvis: { x: 0.15 }, s1: { x: 0.05 }, head: { x: -0.2 }, arms: { f: 1.45, e: 0.05, a: 0.1 } }),
  },
  hCoccyx: {
    label: 'Coccyx balance',
    pose: () => ({ pelvis: { x: -0.65 }, legs: { f: 2.0, k: 0.15, p: 0.8 }, s2: { x: 0.1 }, head: { x: 0.1 }, arms: { f: 1.65, a: 0.15, e: 0.02 } }),
  },
  hLunge: {
    label: 'Deep lunge',
    pose: () => ({
      legL: { f: 1.3, k: 1.75 }, legR: { f: -0.6, k: 0.1, p: 0.4 },
      pelvis: { x: 0.1 }, s1: { x: 0.05 }, arms: { a: 1.55, e: 0.02 },
    }),
  },

  // ---- Limón ----
  lSwingDown: {
    label: 'Swing: drop',
    pose: (p) => ({
      ...hinge(0.95, { k: 0.75 }), s1: { x: 0.45 * T(p) }, s2: { x: 0.5 * T(p) }, neck: { x: 0.35 }, head: { x: 0.3 },
      arms: { f: 1.9, a: 0.1, e: 0.1 },
    }),
  },
  lSwingUp: {
    label: 'Suspension',
    pose: () => ({ legs: { p: 0.55, f: 0.05, d: 1 }, s2: { x: -0.15 }, head: { x: -0.2 }, arms: { f: 2.9, a: 0.35, e: 0.2, w: -0.3, c: 0.15 } }),
  },
  lHeadDrop: {
    label: 'Head and torso drop',
    pose: (p) => ({ legs: { f: 0.4, k: 0.8 }, s1: { x: 0.15 }, s2: { x: 0.35 * T(p) }, neck: { x: 0.55 }, head: { x: 0.45 }, arms: { f: 0.3, e: 0.3 } }),
  },
  lFall: {
    label: 'Fall',
    pose: (p) => ({
      root: { z: 0.4 * F(p) },
      legR: { a: 0.5, f: 0.35, k: 0.6 }, legL: { a: 0.05, f: 0.1, k: 0.2, p: 0.25 },
      s1: { z: -0.2 }, s2: { z: -0.25, x: 0.1 }, neck: { z: -0.2 }, head: { z: -0.2 },
      armL: { a: 2.3, e: 0.25 }, armR: { a: 0.7, f: 0.4, e: 0.4 },
    }),
  },
  lRebound: {
    label: 'Rebound',
    pose: () => ({ legs: { p: 0.5, d: 1 }, arms: { a: 2.0, f: 0.4, e: 0.2, w: -0.3, c: 0.15 }, s2: { x: -0.22 }, neck: { x: -0.15 }, head: { x: -0.2 } }),
  },
  lSuccession: {
    label: 'Successional arms',
    pose: () => ({ legs: { f: 0.2, k: 0.4 }, arms: { a: 1.35, f: 0.2, e: 1.1, w: 0.7 }, s2: { x: 0.12 }, head: { x: 0.1 } }),
  },

  // ---- Dunham ----
  dHipL: {
    label: 'Hip isolation',
    pose: () => ({ pelvis: { shift: 0.07, z: -0.18 }, s1: { z: 0.22 }, s2: { z: -0.04 }, legs: { f: 0.45, k: 0.9, a: 0.15 }, arms: { a: 0.95, f: 0.35, e: 1.15 } }),
  },
  dHipR: {
    label: 'Hip isolation',
    pose: () => ({ pelvis: { shift: -0.07, z: 0.18 }, s1: { z: -0.22 }, s2: { z: 0.04 }, legs: { f: 0.45, k: 0.9, a: 0.15 }, arms: { a: 0.95, f: 0.35, e: 1.15 } }),
  },
  dRibL: {
    label: 'Rib isolation',
    pose: () => ({ s1: { z: -0.18 }, s2: { z: 0.22 }, neck: { z: -0.15 }, head: { z: -0.05 }, legs: { f: 0.35, k: 0.7, a: 0.12 }, arms: { a: 1.1, e: 0.8, f: 0.2 } }),
  },
  dRibR: {
    label: 'Rib isolation',
    pose: () => ({ s1: { z: 0.18 }, s2: { z: -0.22 }, neck: { z: 0.15 }, head: { z: 0.05 }, legs: { f: 0.35, k: 0.7, a: 0.12 }, arms: { a: 1.1, e: 0.8, f: 0.2 } }),
  },
  dWalkL: {
    label: 'Dunham walk',
    pose: () => ({
      'travel.z': 0.25,
      legL: { f: 1.05, k: 1.35, p: 0.6 }, legR: { f: 0.35, k: 0.7 },
      pelvis: { x: -0.15 }, s2: { x: 0.12, y: -0.15 }, armL: { a: 0.8, e: 1.4, f: -0.3 }, armR: { a: 0.6, f: 0.8, e: 1.2 },
    }),
  },
  dWalkR: {
    label: 'Dunham walk',
    pose: () => ({
      'travel.z': 0.5,
      legR: { f: 1.05, k: 1.35, p: 0.6 }, legL: { f: 0.35, k: 0.7 },
      pelvis: { x: -0.15 }, s2: { x: 0.12, y: 0.15 }, armR: { a: 0.8, e: 1.4, f: -0.3 }, armL: { a: 0.6, f: 0.8, e: 1.2 },
    }),
  },

  // ---- Cunningham ----
  cUpright: {
    label: 'Upright',
    pose: () => ({ legs: { t: 0.6, a: 0.02 }, arms: { f: 0.35, a: 0.25, e: 0.5 }, head: { x: -0.05 } }),
  },
  cCurve: {
    label: 'Curve',
    pose: (p) => ({ legs: { t: 0.6, a: 0.02 }, s1: { x: 0.1 }, s2: { x: 0.45 * T(p) }, neck: { x: 0.25 }, head: { x: 0.2 }, arms: { f: 0.7, a: 0.3, e: 0.6 } }),
  },
  cArch: {
    label: 'Arch',
    pose: (p) => ({ legs: { t: 0.6, a: 0.02 }, s2: { x: -0.35 * T(p) }, neck: { x: -0.2 }, head: { x: -0.25 }, arms: { a: 1.45, f: -0.15, e: 0.1 } }),
  },
  cTilt: {
    label: 'Tilt with leg',
    pose: (p) => ({
      legR: { t: 0.6 }, legL: { a: 0.85, t: 0.6, p: 0.9 },
      s1: { z: 0.2 }, s2: { z: 0.3 * T(p) }, neck: { z: 0.05 },
      armL: { a: 1.5, e: 0.05 }, armR: { a: 1.5, e: 0.05 },
    }),
  },
  cTwist: {
    label: 'Twist',
    pose: (p) => ({ legs: { t: 0.6 }, s1: { y: 0.25 * T(p) }, s2: { y: 0.45 * T(p) }, head: { y: 0.2 }, armL: { a: 1.45, e: 0.05 }, armR: { a: 1.45, e: 0.05 } }),
  },
  cTendu: {
    label: 'Tendu front',
    pose: () => ({ legL: { f: 0.5, t: 0.6, p: 1.0 }, legR: { t: 0.6 }, armR: { a: 1.4, f: 0.25, e: 0.25 }, armL: { a: 0.3, f: 0.4, e: 0.5 }, head: { y: 0.15 } }),
  },
  cAttitude: {
    label: 'Attitude balance',
    pose: () => ({ legL: { f: -0.75, a: 0.2, t: 0.6, k: 1.2, p: 0.9 }, legR: { t: 0.6, p: 0.7, d: 1 }, pelvis: { x: 0.15 }, s2: { x: -0.15 }, armL: { f: 2.8, a: 0.2, e: 0.4 }, armR: { a: 1.4, e: 0.2 } }),
  },

  // ---- Butoh ----
  bGanimata: {
    label: 'Ganimata stance',
    pose: (p) => ({
      legs: { f: 0.75, a: 0.32, t: 0.55, k: 1.25 },
      pelvis: { x: 0.15 }, s1: { x: 0.1 }, s2: { x: 0.25 * T(p) }, neck: { x: -0.15 }, head: { x: 0.05 },
      arms: { f: 0.55, a: 0.35, e: 1.5, w: 1.1, t: 0.4, c: 1.0 },
    }),
  },
  bWalkL: {
    label: 'Slow walk',
    pose: () => ({ 'travel.z': 0.18, legs: { f: 0.7, a: 0.3, t: 0.55, k: 1.2 }, legL: { f: 1.0, a: 0.3, t: 0.55, k: 1.5 }, pelvis: { x: 0.15 }, s2: { x: 0.25 }, arms: { f: 0.6, a: 0.3, e: 1.55, w: 1.2 } }),
  },
  bWalkR: {
    label: 'Slow walk',
    pose: () => ({ 'travel.z': 0.36, legs: { f: 0.7, a: 0.3, t: 0.55, k: 1.2 }, legR: { f: 1.0, a: 0.3, t: 0.55, k: 1.5 }, pelvis: { x: 0.15 }, s2: { x: 0.25 }, arms: { f: 0.6, a: 0.3, e: 1.55, w: 1.2 } }),
  },
  bTransform: {
    label: 'Transformation',
    pose: () => ({
      legs: { f: 0.6, a: 0.3, t: 0.5, k: 1.1 },
      s1: { y: 0.2 }, s2: { y: 0.3, z: 0.2, x: -0.1 }, neck: { z: 0.2 }, head: { x: -0.35, z: 0.15 },
      armR: { f: 2.5, a: 0.4, e: 0.6, w: 1.3 }, armL: { f: 0.3, a: 0.2, e: 1.7, w: 1.4 },
    }),
  },
  bCollapse: {
    label: 'Slow collapse',
    pose: () => ({ legs: { f: 1.6, k: 2.3, a: 0.35, t: 0.5 }, pelvis: { x: 0.2 }, s1: { x: 0.4 }, s2: { x: 0.5 }, neck: { x: 0.3 }, head: { x: 0.2 }, arms: { f: 0.9, e: 1.7, w: 1.2 } }),
  },

  // ---- Release ----
  rRest: {
    label: 'Constructive rest',
    pose: () => ({ root: { x: -1.5 }, legs: { f: 1.25, k: 2.05, a: 0.05 }, arms: { a: 0.25, e: 0.2 }, head: { x: 0.1 } }),
  },
  rRollUp: {
    label: 'Roll up through the spine',
    pose: () => ({ legs: { f: 1.45, k: 0.6, a: 0.1 }, pelvis: { x: -0.3 }, s1: { x: 0.55 }, s2: { x: 0.5 }, neck: { x: 0.4 }, head: { x: 0.3 }, arms: { f: 1.0, e: 0.3 } }),
  },
  rSpiralUp: {
    label: 'Spiral to standing',
    pose: () => ({ legL: { f: 1.6, k: 2.2, a: 0.2 }, legR: { f: 0.6, k: 1.7, a: 0.15, p: 0.6 }, s1: { y: 0.35, x: 0.4 }, s2: { y: 0.3, x: 0.3 }, head: { y: 0.2 }, armR: { f: 1.4, a: 0.4, e: 0.15 }, armL: { f: 0.5, a: 0.6, e: 0.4 } }),
  },
  rSwing: {
    label: 'Release swing',
    pose: (p) => ({ ...hinge(0.85, { k: 0.9 }), s1: { x: 0.35 * T(p) }, s2: { x: 0.45 * T(p) }, neck: { x: 0.35 }, head: { x: 0.35 }, arms: { f: 1.8, e: 0.3, w: 0.3 } }),
  },
  rReach: {
    label: 'Long reach',
    pose: () => ({
      'travel.x': -0.15,
      legR: { f: 0.45, k: 0.85, a: 0.2 }, legL: { a: 0.35, k: 0.05, p: 0.4 },
      root: { z: 0.12 }, s1: { z: -0.15 }, s2: { z: -0.2 }, head: { z: -0.1 },
      armL: { a: 2.55, e: 0.15 }, armR: { a: 0.9, f: 0.3, e: 0.5 },
    }),
  },

  // ---- Contact Improvisation (duet; partners face each other) ----
  ciSmallDance: {
    label: 'Small dance',
    pose: () => ({ root: { y: 1.4 }, legs: { f: 0.08, k: 0.15 }, arms: { a: 0.08, e: 0.15 }, head: { x: 0.08 } }),
  },
  ciLean: {
    label: 'Lean and share weight',
    pose: () => ({ root: { y: 1.4, x: 0.22 }, 'travel.x': 0.1, legs: { f: 0.5, k: 0.85 }, legR: { f: -0.2, k: 0.2, p: 0.3 }, s1: { x: 0.1 }, armL: { f: 1.15, a: 0.6, e: 0.7 }, armR: { f: 1.0, a: 0.3, e: 0.9 }, head: { y: 0.6, x: 0.1 } }),
  },
  ciCounter: {
    label: 'Counterbalance',
    pose: () => ({ root: { y: 1.4, x: -0.38 }, 'travel.x': 0.15, legs: { f: 0.95, k: 1.3 }, arms: { f: 1.6, a: 0.12, e: 0.02 }, s2: { x: 0.1 }, head: { x: 0.15 } }),
  },
  ciRoll: {
    label: 'Roll to the floor',
    pose: () => ({ root: { y: 1.4, z: 1.3 }, legs: { f: 1.3, k: 1.6 }, s1: { x: 0.4 }, s2: { x: 0.3 }, neck: { x: 0.3 }, armL: { f: 1.3, e: 0.9 }, armR: { f: 1.5, a: 0.3, e: 0.3 } }),
  },
  ciTable: {
    label: 'Table (giving a base)',
    pose: () => ({ root: { y: 1.4, x: 1.45 }, 'travel.x': 0.05, legs: { f: 1.5, k: 1.6, a: 0.1, p: 1.0 }, arms: { f: 1.45, a: 0.12, e: 0.05 }, neck: { x: -0.3 }, head: { x: -0.2 } }),
  },
  ciOver: {
    label: 'Riding over the back',
    pose: () => ({ root: { y: 1.4 }, 'travel.x': 0.2, ...hinge(1.15, { k: 0.5 }), legR: { f: 0.5, k: 0.3, p: 0.5 }, s2: { x: 0.3 }, neck: { x: 0.2 }, arms: { f: 1.6, a: 0.3, e: 0.15 } }),
  },

  // ---- Forsythe ----
  fPointLine: {
    label: 'Point–point–line',
    pose: () => ({ legs: { t: 0.5 }, legL: { f: 0.3, t: 0.5, k: 0.4 }, s2: { y: -0.3, z: 0.1 }, head: { y: -0.35 }, armR: { f: 1.2, a: 0.7, e: 0.05, w: -0.3 }, armL: { a: 1.9, f: -0.5, e: 0.05 } }),
  },
  fInscribe: {
    label: 'Inscription (elbow)',
    pose: () => ({ legs: { t: 0.5, f: 0.3, k: 0.55 }, s2: { z: -0.25, y: 0.2 }, neck: { z: 0.15 }, armL: { a: 1.4, f: 0.6, e: 1.9, w: 0.6 }, armR: { a: 0.4, f: -0.3, e: 0.6 } }),
  },
  fExtrude: {
    label: 'Extrusion',
    pose: () => ({ root: { z: 0.22 }, legR: { t: 0.5, k: 0.2 }, legL: { a: 0.8, t: 0.5, p: 0.85 }, s2: { z: -0.2 }, armR: { a: 2.3, e: 0.02 }, armL: { a: 1.2, f: 0.9, e: 0.05 }, head: { z: -0.2, y: 0.3 } }),
  },
  fDropCurve: {
    label: 'Dropping curve',
    pose: () => ({ legs: { f: 0.55, k: 1.0, t: 0.4 }, s1: { z: -0.35, x: 0.15 }, s2: { x: 0.35, z: -0.15 }, neck: { z: 0.35 }, head: { z: 0.2 }, armR: { f: 0.2, a: 0.1, e: 0.2 }, armL: { a: 1.0, f: 1.0, e: 1.2, w: 0.8 } }),
  },
  fPlane: {
    label: 'Rotating a plane',
    pose: () => ({ legs: { t: 0.5 }, legR: { f: 0.2, t: 0.5, p: 0.7 }, s1: { y: 0.35 }, s2: { y: 0.45, x: -0.1 }, head: { y: 0.3 }, armL: { a: 1.57, e: 0.02 }, armR: { a: 1.57, e: 0.02 } }),
  },

  // ---- Flying Low ----
  flLow: {
    label: 'Low stance',
    pose: () => ({ legs: { f: 1.4, a: 0.5, t: 0.4, k: 2.0 }, pelvis: { x: 0.35 }, s1: { x: 0.25 }, s2: { x: 0.15 }, head: { x: -0.3 }, arms: { f: 1.35, a: 0.4, e: 0.2 } }),
  },
  flSpiralDown: {
    label: 'Spiral into the floor',
    pose: () => ({ root: { z: 0.6 }, legL: { f: 1.7, k: 2.3, a: 0.2 }, legR: { f: 0.9, k: 2.1, a: 0.6 }, s1: { y: 0.45, x: 0.35 }, s2: { y: 0.4, x: 0.25 }, head: { y: 0.3 }, armR: { f: 1.5, a: 0.5, e: 0.1 }, armL: { a: 1.6, e: 0.3 } }),
  },
  flRoll: {
    label: 'Roll through',
    pose: () => ({ root: { z: 1.35 }, legs: { f: 1.45, k: 1.75 }, s1: { x: 0.45 }, s2: { x: 0.3 }, neck: { x: 0.3 }, armL: { f: 1.3, e: 0.9 }, armR: { f: 1.6, a: 0.3, e: 0.3 } }),
  },
  flPush: {
    label: 'Push up from the floor',
    pose: () => ({ legs: { f: 1.75, k: 2.4, a: 0.25 }, pelvis: { x: 0.2 }, s1: { x: 0.5 }, s2: { x: 0.35 }, neck: { x: -0.25 }, arms: { f: 1.3, a: 0.35, e: 0.1 } }),
  },
  flTravelL: {
    label: 'Low travel',
    pose: () => ({ 'travel.x': 0.35, legL: { f: 0.9, a: 0.7, k: 1.8 }, legR: { a: 0.6, k: 0.2, p: 0.3 }, pelvis: { x: 0.3, z: -0.15 }, s2: { y: 0.3 }, armL: { a: 1.5, e: 0.1 }, armR: { f: 1.4, a: 0.2, e: 0.3 } }),
  },
  flTravelR: {
    label: 'Low travel',
    pose: () => ({ 'travel.x': -0.35, legR: { f: 0.9, a: 0.7, k: 1.8 }, legL: { a: 0.6, k: 0.2, p: 0.3 }, pelvis: { x: 0.3, z: 0.15 }, s2: { y: -0.3 }, armR: { a: 1.5, e: 0.1 }, armL: { f: 1.4, a: 0.2, e: 0.3 } }),
  },

  // ---- Gaga ----
  ggFloat: {
    label: 'Float',
    pose: () => ({ legs: { f: 0.2, k: 0.4 }, s2: { x: -0.1 }, head: { x: -0.1 }, arms: { a: 1.15, f: 0.35, e: 0.6, w: -0.4 } }),
  },
  ggQuake: {
    label: 'Quake',
    pose: () => ({ shake: 1, legs: { f: 0.3, k: 0.6 }, arms: { a: 0.5, f: 0.2, e: 0.3 }, s2: { x: 0.05 } }),
  },
  ggWaveA: {
    label: 'Spine wave',
    pose: (p) => ({ legs: { f: 0.35, k: 0.7 }, pelvis: { x: -0.2 }, s1: { x: 0.35 * T(p) }, s2: { x: -0.25 * T(p) }, neck: { x: 0.3 }, head: { x: -0.2 }, arms: { a: 0.9, e: 0.9, w: 0.5 } }),
  },
  ggWaveB: {
    label: 'Spine wave',
    pose: (p) => ({ legs: { f: 0.35, k: 0.7 }, pelvis: { x: 0.2 }, s1: { x: -0.25 * T(p) }, s2: { x: 0.35 * T(p) }, neck: { x: -0.2 }, head: { x: 0.25 }, arms: { a: 0.7, e: 0.6, w: -0.3 } }),
  },
  ggExplode: {
    label: 'Explosive reach',
    pose: () => ({ legL: { a: 0.45, p: 0.5 }, legR: { f: 0.2, k: 0.3 }, s2: { x: -0.3, y: 0.2 }, head: { x: -0.3 }, armL: { a: 2.6, e: 0.02, w: -0.4 }, armR: { a: 1.9, f: -0.3, e: 0.05 } }),
  },
  ggMelt: {
    label: 'Melt',
    pose: () => ({ legs: { f: 1.3, k: 2.1, a: 0.2 }, s1: { x: 0.45 }, s2: { x: 0.45 }, neck: { x: 0.35 }, head: { x: 0.3 }, arms: { f: 0.6, e: 0.6, w: 0.6 } }),
  },

  // ---- Countertechnique ----
  ctScan: {
    label: 'Scanning',
    pose: () => ({ legs: { f: 0.15, k: 0.3, a: 0.08 }, arms: { a: 0.3, e: 0.3 }, head: { y: 0.15 } }),
  },
  ctSwing: {
    label: 'Weight-shift swing',
    pose: () => ({ 'travel.x': 0.2, legL: { f: 0.5, a: 0.35, k: 0.95 }, legR: { a: 0.3, k: 0.05, p: 0.2 }, s2: { z: -0.2 }, armR: { a: 2.2, e: 0.2 }, armL: { a: 0.8, f: -0.2, e: 0.3 } }),
  },
  ctCounter: {
    label: 'Counter-directions',
    pose: (p) => ({
      root: { z: 0.32 * F(p) }, legR: { a: 0.35, f: 0.25, k: 0.45 }, legL: { a: 0.75, p: 0.7 },
      pelvis: { z: -0.15 }, s2: { z: -0.3 }, head: { z: -0.25 }, armL: { a: 2.4, e: 0.05 }, armR: { a: 1.3, f: -0.3, e: 0.1 },
    }),
  },
  ctBigOff: {
    label: 'Big off-balance',
    pose: (p) => ({
      root: { x: 0.25 * F(p) }, 'travel.z': 0.2,
      legL: { f: 0.9, k: 1.2 }, legR: { f: -0.7, k: 0.05, p: 0.7 },
      s2: { x: -0.25, y: 0.3 }, head: { x: -0.2 }, armL: { f: 2.6, e: 0.1 }, armR: { f: -0.6, a: 0.4, e: 0.1 },
    }),
  },
};


// ---------------------------------------------------------------------------
// More moves: class exercises and the six later-added techniques
// ---------------------------------------------------------------------------
Object.assign(MOVES, {
  // ---- Class extras for the original techniques ----
  gSideFall: {
    label: 'Side fall',
    pose: () => ({ root: { z: 1.35 }, legs: { f: 0.9, k: 1.4 }, s2: { x: 0.2 }, head: { z: -0.2 }, armL: { a: 2.6, e: 0.15, c: 0.2 }, armR: { f: 0.8, e: 0.6 } }),
  },
  gTripletL: {
    label: 'Triplets',
    pose: () => ({ 'travel.z': 0.3, legL: { f: 0.5, k: 0.55 }, legR: { f: -0.25, p: 0.6, d: 1 }, s2: { y: 0.15 }, arms: { a: 1.1, f: 0.3, e: 0.3, c: 0.2 } }),
  },
  gTripletR: {
    label: 'Triplets',
    pose: () => ({ 'travel.z': 0.6, legR: { f: 0.5, k: 0.55 }, legL: { f: -0.25, p: 0.6, d: 1 }, s2: { y: -0.15 }, arms: { a: 1.1, f: 0.3, e: 0.3, c: 0.2 } }),
  },
  hProg: {
    label: 'Lunge progression',
    pose: () => ({ 'travel.z': 0.35, legL: { f: 1.0, k: 1.3 }, legR: { f: -0.45, p: 0.4, d: 1 }, arms: { a: 1.55, e: 0.02, c: 0.1 } }),
  },
  lRun: {
    label: 'Run and suspend',
    pose: () => ({ lift: 0.08, 'travel.z': 0.4, legL: { f: 0.9, k: 1.0 }, legR: { f: -0.6, k: 0.6, p: 0.9 }, arms: { a: 1.6, f: 0.5, e: 0.2, c: 0.15 }, s2: { x: -0.15 }, head: { x: -0.2 } }),
  },
  dTendu: {
    label: 'Barre tendu',
    pose: () => ({ legL: { a: 0.5, t: 0.5, p: 1.0 }, legR: { t: 0.5 }, armR: { a: 1.3, f: 0.3, e: 0.3 }, armL: { f: 0.45, a: 0.25, e: 0.6 }, head: { y: -0.2 } }),
  },
  dShoulderL: {
    label: 'Shoulder isolation',
    pose: () => ({ armL: { sh: 1.0, a: 0.9, f: 0.3, e: 1.2 }, armR: { a: 0.9, f: 0.3, e: 1.2 }, legs: { f: 0.35, k: 0.7, a: 0.12 }, head: { z: 0.1 } }),
  },
  dShoulderR: {
    label: 'Shoulder isolation',
    pose: () => ({ armR: { sh: 1.0, a: 0.9, f: 0.3, e: 1.2 }, armL: { a: 0.9, f: 0.3, e: 1.2 }, legs: { f: 0.35, k: 0.7, a: 0.12 }, head: { z: -0.1 } }),
  },
  cDegage: {
    label: 'Dégagé',
    pose: () => ({ legL: { f: 0.85, t: 0.6, p: 1.0 }, legR: { t: 0.6 }, arms: { a: 1.4, e: 0.1, c: 0.2 }, head: { y: 0.1 } }),
  },
  cJete: {
    label: 'Jeté',
    pose: () => ({ lift: 0.28, 'travel.z': 0.3, legL: { f: 1.0, t: 0.5, k: 0.1, p: 1 }, legR: { f: -0.85, t: 0.5, k: 0.1, p: 1 }, arms: { a: 1.4, f: 0.6, e: 0.15, c: 0.15 }, s2: { x: -0.1 } }),
  },
  bFlower: {
    label: 'Flower hands',
    pose: () => ({ legs: { f: 0.7, a: 0.3, t: 0.55, k: 1.2 }, s3: { x: -0.15 }, head: { x: -0.3 }, arms: { f: 2.4, a: 0.3, e: 1.0, w: -0.6, c: 0.05 } }),
  },

  // ---- Wigman ----
  wTension: {
    label: 'Tension',
    pose: () => ({ legs: { f: 1.0, k: 1.6, a: 0.3 }, s1: { x: 0.35 }, s2: { x: 0.4 }, head: { x: 0.2 }, arms: { f: 1.0, a: 0.6, e: 1.6, c: 1.6, sh: 0.7 } }),
  },
  wRelax: {
    label: 'Relaxation',
    pose: () => ({ ...hinge(0.7, { k: 0.5 }), s2: { x: 0.4 }, neck: { x: 0.5 }, head: { x: 0.3 }, arms: { f: 1.3, e: 0.1, c: 0.2 } }),
  },
  wReach: {
    label: 'Reaching into space',
    pose: () => ({ legL: { f: 1.0, k: 1.2, a: 0.3 }, legR: { a: 0.4, k: 0.05, p: 0.3 }, armL: { f: 2.4, a: 0.9, e: 0.02, c: 0.05 }, armR: { a: 1.0, f: -0.5, e: 0.1 }, s2: { x: -0.2, y: 0.3 }, head: { x: -0.25, y: 0.3 } }),
  },
  wTurnA: {
    label: 'Ecstatic turning',
    pose: () => ({ root: { y: 2.6 }, legs: { p: 0.3, d: 1 }, arms: { a: 1.5, e: 0.3, c: 0.2 }, s3: { x: -0.2 }, head: { x: -0.25 } }),
  },
  wTurnB: {
    label: 'Ecstatic turning',
    pose: () => ({ root: { y: 5.2 }, legs: { p: 0.3, d: 1 }, arms: { a: 2.2, e: 0.2, c: 0.1 }, s3: { x: -0.25 }, head: { x: -0.35 } }),
  },
  wWitch: {
    label: 'Witch Dance',
    // Seated on the floor: knees high and open so the pelvis reaches the floor with the soles flat.
    pose: () => ({ legs: { f: 2.4, a: 0.55, k: 2.5, t: 0.3 }, pelvis: { x: -0.1 }, s2: { x: 0.35 }, head: { x: -0.15 }, arms: { f: 1.0, a: 0.7, e: 1.3, w: -0.6, c: 1.0, sh: 0.6 } }),
  },

  // ---- Humphrey–Weidman ----
  hwBreath: {
    label: 'Breath rhythm',
    pose: () => ({ legs: { p: 0.4, d: 1 }, s3: { x: -0.2 }, head: { x: -0.15 }, arms: { a: 1.0, f: 0.3, e: 0.5, c: 0.2 } }),
  },
  hwWaterCurl: {
    label: 'Water Study: curl',
    // Kneeling, sitting back on the heels, curled forward over the knees.
    pose: () => ({ legs: { f: 2.35, k: 2.8, p: 1.2 }, pelvis: { x: 0.8 }, s1: { x: 0.5 }, s2: { x: 0.5 }, neck: { x: 0.4 }, head: { x: 0.2 }, arms: { f: 2.0, e: 0.2, c: 0.2 } }),
  },
  hwWaterRise: {
    label: 'Water Study: wave rises',
    pose: () => ({ legs: { f: -0.2, k: 1.6, p: 1.2 }, pelvis: { x: -0.2 }, s2: { x: -0.2 }, head: { x: -0.2 }, arms: { f: 2.3, a: 0.3, e: 0.3, c: 0.2 } }),
  },
  hwPantomime: {
    label: 'Weidman pantomime',
    pose: () => ({ armL: { f: 0.7, a: 0.3, e: 2.2, t: 0.6, c: 0.6 }, armR: { f: 1.5, a: 0.6, e: 0.1, c: 0.9 }, head: { y: -0.3 }, s3: { y: -0.2 }, legR: { f: 0.3, k: 0.3 } }),
  },

  // ---- Hawkins ----
  hkSwing: {
    label: 'Free-flow swing',
    pose: () => ({ arms: { f: 1.6, a: 0.2, e: 0.4, c: 0.2 }, s2: { x: 0.1 }, legs: { f: 0.25, k: 0.45 } }),
  },
  hkSwingBack: {
    label: 'Free-flow swing',
    pose: () => ({ arms: { f: -0.6, a: 0.2, e: 0.2, c: 0.3 }, s2: { x: -0.05 }, legs: { f: 0.2, k: 0.4 } }),
  },
  hkPelvicWalk: {
    label: 'Walking from the pelvis',
    pose: () => ({ 'travel.z': 0.25, pelvis: { x: -0.15, y: 0.15 }, legL: { f: 0.5, k: 0.4 }, legR: { p: 0.3 }, arms: { a: 0.3, e: 0.3 } }),
  },
  hkArc: {
    label: 'Arc of the arm',
    pose: () => ({ armL: { a: 2.0, f: 0.6, e: 0.3, c: 0.1 }, armR: { a: 0.5, e: 0.3 }, s3: { z: -0.15, y: 0.2 }, head: { y: 0.25 }, legs: { f: 0.1, k: 0.2 } }),
  },
  hkBalance: {
    label: 'Effortless balance',
    pose: () => ({ legL: { f: 0.6, k: 1.0, t: 0.3 }, legR: { p: 0.4, d: 1 }, arms: { f: 1.3, a: 0.4, e: 0.6, c: 0.3 } }),
  },

  // ---- Nikolais / Louis ----
  nElbowLead: {
    label: 'Decentralised: elbow leads',
    pose: () => ({ armL: { a: 1.2, f: 0.6, e: 1.9, w: 0.5 }, s3: { z: -0.25, y: 0.3 }, pelvis: { shift: 0.04 }, legs: { f: 0.3, k: 0.5 } }),
  },
  nKneeLead: {
    label: 'Decentralised: knee leads',
    pose: () => ({ legL: { f: 1.3, k: 1.6, a: 0.4, t: 0.3 }, legR: { p: 0.3, d: 1 }, s2: { z: 0.15 }, arms: { a: 0.6, e: 0.8 } }),
  },
  nShape: {
    label: 'Sculpting space',
    pose: () => ({ armL: { f: 2.3, a: 0.3, e: 1.4, w: 0.9 }, armR: { a: 1.6, e: 1.5, w: -0.6 }, s3: { y: -0.4 }, head: { y: 0.3 }, legs: { a: 0.35, k: 0.3, t: 0.4 } }),
  },
  nExpand: {
    label: 'Expanding volume',
    pose: () => ({ arms: { a: 1.9, f: 0.3, e: 0.05, c: 0 }, legs: { a: 0.45 }, s3: { x: -0.15 }, head: { x: -0.2 } }),
  },
  nContract: {
    label: 'Shrinking volume',
    pose: () => ({ legs: { f: 1.6, k: 2.3, a: 0.2 }, s1: { x: 0.45 }, s2: { x: 0.5 }, neck: { x: 0.4 }, arms: { f: 1.0, a: 0.2, e: 2.0, c: 1.2 } }),
  },

  // ---- Taylor ----
  tTilt: {
    label: 'Taylor tilt',
    pose: () => ({ legL: { a: 1.25, t: 0.5, p: 1 }, legR: { t: 0.5, k: 0.05 }, s1: { z: 0.3 }, s2: { z: 0.4 }, armL: { a: 2.6, e: 0.1 }, armR: { a: 1.4, e: 0.05 }, head: { z: 0.1 } }),
  },
  tRun: {
    label: 'Run',
    pose: () => ({ lift: 0.06, 'travel.z': 0.45, legL: { f: 0.9, k: 1.1 }, legR: { f: -0.5, k: 0.8, p: 0.8 }, arms: { f: 0.6, a: 0.3, e: 0.9 }, s2: { x: 0.1 } }),
  },
  tFall: {
    label: 'Fall and roll',
    pose: () => ({ root: { z: 1.3 }, legs: { f: 1.2, k: 1.4 }, arms: { a: 2.2, e: 0.2 }, s2: { x: 0.2 } }),
  },
  tAureole: {
    label: 'Lyrical arms',
    pose: () => ({ legL: { f: 0.5, t: 0.4, p: 1 }, legR: { t: 0.4, k: 0.1 }, arms: { a: 1.7, f: 0.4, e: 0.25, w: -0.3, c: 0.1 }, s3: { x: -0.15 }, head: { x: -0.2 } }),
  },

  // ---- Klein ----
  kFloor: {
    label: 'Deep support on the floor',
    pose: () => ({ root: { x: -1.5 }, legs: { f: 0.4, k: 0.4 }, arms: { a: 0.5, e: 0.2 } }),
  },
  kAlign: {
    label: 'Standing alignment',
    pose: () => ({ legs: { f: 0.05, k: 0.1, a: 0.03 }, arms: { a: 0.08, e: 0.1, c: 0.3 } }),
  },
  kRollDown: {
    label: 'Roll down through the spine',
    pose: () => ({ ...hinge(1.0, { k: 0.35 }), s1: { x: 0.5 }, s2: { x: 0.6 }, neck: { x: 0.5 }, head: { x: 0.3 }, arms: { f: 2.0, e: 0.05, c: 0.3 } }),
  },
  kRotation: {
    label: 'Rotation from the deep hip',
    pose: () => ({ legs: { t: 0.7, a: 0.05, f: 0.15, k: 0.3 }, pelvis: { x: -0.05 }, arms: { a: 0.3, e: 0.3 } }),
  },
});

// ---------------------------------------------------------------------------
// Phrases: [move, beats]. Each begins and ends on "stand" (added by the player).
// ---------------------------------------------------------------------------
export const PHRASES = {
  intro: { steps: [['plie2', 1], ['releve', 1]] },
  graham: {
    steps: [['gSeated', 1.3], ['gBreathContract', 1], ['gBreathRelease', 1], ['gSpiral', 1.2], ['gPleading', 1.3], ['contraction', 1], ['release', 1], ['spiralStand', 1]],
  },
  horton: { steps: [['hFlatBack', 1.2], ['hLateral', 1], ['hLateralT', 1.2], ['hHinge', 1.1], ['hLunge', 1], ['hSquat', 1.1], ['hCoccyx', 1.3]] },
  limon: { steps: [['lSwingDown', 1], ['lSwingUp', 1], ['lHeadDrop', 1], ['lFall', 1.1], ['lRebound', 1], ['lSuccession', 1]] },
  dunham: { steps: [['plie2', 1], ['dHipL', 0.6], ['dHipR', 0.6], ['dHipL', 0.6], ['dRibL', 0.6], ['dRibR', 0.6], ['dWalkL', 0.8], ['dWalkR', 0.8]] },
  cunningham: { steps: [['cUpright', 0.8], ['cCurve', 0.8], ['cUpright', 0.6], ['cArch', 0.8], ['cTilt', 1], ['cTwist', 0.8], ['cTendu', 0.7], ['cAttitude', 1.1], ['releve', 0.8]] },
  butoh: { steps: [['bGanimata', 1.4], ['bWalkL', 1.6], ['bWalkR', 1.6], ['bTransform', 1.8], ['bCollapse', 1.8]] },
  release: { steps: [['rRest', 1.4], ['rRollUp', 1.2], ['rSpiralUp', 1.1], ['rSwing', 1], ['lSwingUp', 0.9], ['rReach', 1.1]] },
  contact: {
    duet: true,
    steps: [['ciSmallDance', 1.2], ['ciLean', 1.2], ['ciCounter', 1.2], ['ciTable', 1.4], ['ciRoll', 1.2]],
    // What the partner does on each of those counts.
    partner: [['ciSmallDance', 1.2], ['ciLean', 1.2], ['ciCounter', 1.2], ['ciOver', 1.4], ['ciRoll', 1.2]],
  },
  forsythe: { steps: [['fPointLine', 1], ['fInscribe', 1], ['fExtrude', 1], ['fDropCurve', 1], ['fPlane', 1]] },
  flyinglow: { steps: [['flLow', 0.9], ['flSpiralDown', 0.9], ['flRoll', 0.9], ['flPush', 0.8], ['flTravelL', 0.8], ['flTravelR', 0.8]] },
  gaga: { steps: [['ggFloat', 1.2], ['ggQuake', 1.2], ['ggWaveA', 0.8], ['ggWaveB', 0.8], ['ggExplode', 0.7], ['ggMelt', 1.2]] },
  countertechnique: { steps: [['ctScan', 1], ['ctSwing', 1], ['ctCounter', 1.1], ['ctBigOff', 1.1], ['lRebound', 0.9]] },
  wigman: { steps: [['wTension', 1.2], ['wRelax', 1.2], ['wReach', 1], ['wTurnA', 0.9], ['wTurnB', 0.9], ['wWitch', 1.4]] },
  humphrey: { steps: [['hwBreath', 1], ['lSwingDown', 1], ['lSwingUp', 1], ['lFall', 1.1], ['lRebound', 1], ['hwWaterCurl', 1.2], ['hwWaterRise', 1.2], ['hwPantomime', 1]] },
  hawkins: { steps: [['hkSwing', 1], ['hkSwingBack', 1], ['hkPelvicWalk', 1.1], ['hkArc', 1.1], ['hkBalance', 1.2]] },
  nikolais: { steps: [['nElbowLead', 1], ['nKneeLead', 1], ['nShape', 1], ['nExpand', 1], ['nContract', 1]] },
  taylor: { steps: [['tTilt', 1], ['tRun', 0.7], ['cJete', 0.7], ['tFall', 1], ['tAureole', 1.1], ['spiralStand', 1]] },
  klein: { steps: [['kFloor', 1.4], ['kAlign', 1], ['kRollDown', 1.4], ['kRotation', 1.1], ['rSwing', 1]] },
};

export function moveLabel(id) {
  return MOVES[id]?.label ?? id;
}
