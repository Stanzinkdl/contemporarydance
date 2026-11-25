import * as THREE from 'three';

// A procedural dancer built like an artist's mannequin.
//
// Movement is a *phrase*: a short sequence of named steps (Contraction,
// Spiral, Fall, Recovery…) chosen from the technique's eight scores. Every
// step blends continuously from wherever the body currently is, and each
// phrase starts and ends on the same home pose, so the loop never jumps.

const AXES = ['grounding', 'torso', 'dynamics', 'floor', 'initiation', 'structure', 'fall', 'contact'];

// ---------------------------------------------------------------------------
// Pose representation: a flat dictionary of joint angles (radians).
// Arms/legs use anatomical components: f = flexion (forward), a = abduction
// (outward), t = twist, e = elbow bend, k = knee bend, p = foot point.
// ---------------------------------------------------------------------------
const KEYS = [
  'root.x', 'root.z',
  'pelvis.x', 'pelvis.y', 'pelvis.z', 'pelvis.shift',
  ...['s1', 's2', 'neck'].flatMap((g) => [`${g}.x`, `${g}.y`, `${g}.z`]),
  ...['armL', 'armR'].flatMap((g) => ['f', 'a', 't', 'e'].map((c) => `${g}.${c}`)),
  ...['legL', 'legR'].flatMap((g) => ['f', 'a', 't', 'k', 'p'].map((c) => `${g}.${c}`)),
];
const DEFAULTS = Object.fromEntries(KEYS.map((k) => [k, 0]));
Object.assign(DEFAULTS, { 'armL.a': 0.15, 'armR.a': 0.15, 'armL.e': 0.2, 'armR.e': 0.2, 'legL.a': 0.05, 'legR.a': 0.05 });

function normalize(spec) {
  const out = { ...DEFAULTS };
  for (const [group, comps] of Object.entries(spec)) {
    const targets = group === 'arms' ? ['armL', 'armR'] : group === 'legs' ? ['legL', 'legR'] : [group];
    for (const t of targets) for (const [c, v] of Object.entries(comps)) out[`${t}.${c}`] = v;
  }
  return out;
}

const NEGATE_ON_MIRROR = ['root.z', 'pelvis.y', 'pelvis.z', 'pelvis.shift', 's1.y', 's1.z', 's2.y', 's2.z', 'neck.y', 'neck.z'];
function mirrorPose(P) {
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

function lerpPose(a, b, t) {
  const out = {};
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

// ---------------------------------------------------------------------------
// Move library. Each move is a function of the scores, so turning a number
// changes how deep, how curved or how far off-balance the step is.
// The left side (L) is the dancer's +x side.
// ---------------------------------------------------------------------------
const MOVES = {
  stand: {
    label: 'Stand',
    pose: (p) => {
      const kb = 0.08 + 0.45 * p.grounding;
      return { legs: { f: kb / 2, k: kb, a: 0.06 }, arms: { a: 0.15, f: 0.08, e: 0.2 }, s2: { x: -0.06 * (1 - p.grounding) } };
    },
  },
  plie: {
    label: 'Plié',
    pose: (p) => ({
      legs: { f: 0.5 + 0.3 * p.grounding, k: 1.0 + 0.6 * p.grounding, a: 0.32 },
      arms: { a: 1.25, f: 0.25, e: 0.3 },
    }),
  },
  releve: {
    label: 'Rise',
    pose: () => ({ legs: { a: 0.03, p: 0.75 }, arms: { f: 2.85, a: 0.25, e: 0.35 }, s2: { x: -0.1 }, neck: { x: -0.15 } }),
  },
  extension: {
    label: 'Extension',
    pose: () => ({
      legL: { f: 1.35, a: 0.45, k: 0.05, p: 0.7 },
      legR: { f: 0.03, a: 0.02, k: 0.02 },
      arms: { a: 1.5, f: 0.15, e: 0.12 },
      s2: { x: -0.06 },
    }),
  },
  contraction: {
    label: 'Contraction',
    pose: (p) => {
      const T = 0.4 + 0.8 * p.torso;
      return {
        pelvis: { x: 0.25 * T }, s1: { x: 0.35 * T }, s2: { x: 0.4 * T }, neck: { x: 0.35 * T },
        arms: { f: 1.0, a: 0.35, e: 0.7 }, legs: { f: 0.45, k: 0.9, a: 0.08 },
      };
    },
  },
  release: {
    label: 'High release',
    pose: (p) => {
      const T = 0.4 + 0.8 * p.torso;
      return {
        // Chest lifts and opens; arms open in a high diagonal, palms up and soft.
        pelvis: { x: -0.1 * T }, s1: { x: -0.15 * T }, s2: { x: -0.4 * T }, neck: { x: -0.5 * T },
        arms: { a: 2.15, f: -0.25, e: 0.3 }, legs: { f: 0.3, k: 0.55, a: 0.06 },
      };
    },
  },
  spiral: {
    label: 'Spiral',
    pose: (p) => {
      const T = 0.4 + 0.8 * p.torso;
      return {
        pelvis: { y: 0.15 }, s1: { y: 0.4 * T, x: 0.1 }, s2: { y: 0.45 * T }, neck: { y: 0.35 },
        armL: { f: 1.2, a: 0.2, e: 0.9 }, armR: { f: 0.4, a: 1.1, e: 0.3 },
        legL: { f: 0.45, k: 0.85, a: 0.06 }, legR: { f: 0.35, k: 0.7, a: 0.06 },
      };
    },
  },
  tilt: {
    label: 'Lateral tilt',
    pose: () => ({
      s1: { z: 0.35 }, s2: { z: 0.3 }, neck: { z: 0.1 },
      armL: { a: 2.7, e: 0.2 }, armR: { a: 1.2, e: 0.2 },
      legL: { a: 0.95, f: 0.1, k: 0, p: 0.7 }, legR: { a: 0.02, f: 0.1, k: 0.15 },
    }),
  },
  reach: {
    label: 'Reach',
    pose: () => ({
      armR: { f: 1.55, a: 0.15, e: 0.02 }, armL: { f: -0.6, a: 0.5, e: 0.1 },
      s1: { y: -0.25, x: 0.1 }, s2: { x: 0.15, y: -0.15 }, neck: { x: 0.05 },
      legR: { f: 0.7, k: 0.8, a: 0.04 }, legL: { f: -0.35, k: 0.1, p: 0.3, a: 0.04 },
    }),
  },
  hipL: {
    label: 'Hip isolation',
    pose: () => ({
      pelvis: { shift: 0.06, z: -0.16 }, s1: { z: 0.22 }, s2: { z: -0.06 },
      legs: { f: 0.4, k: 0.8, a: 0.12 }, arms: { a: 0.95, f: 0.35, e: 1.0 },
    }),
  },
  hipR: {
    label: 'Hip isolation',
    pose: () => ({
      pelvis: { shift: -0.06, z: 0.16 }, s1: { z: -0.22 }, s2: { z: 0.06 },
      legs: { f: 0.4, k: 0.8, a: 0.12 }, arms: { a: 0.95, f: 0.35, e: 1.0 },
    }),
  },
  fall: {
    label: 'Fall',
    pose: (p) => {
      const F = 0.4 + 0.8 * p.fall;
      return {
        root: { z: 0.38 * F },
        legR: { a: 0.45, f: 0.35, k: 0.55 }, legL: { a: 0.05, f: 0.1, k: 0.2, p: 0.2 },
        s1: { z: -0.2 }, s2: { z: -0.25, x: 0.1 }, neck: { z: -0.3 },
        armL: { a: 2.3, e: 0.25 }, armR: { a: 0.7, f: 0.4, e: 0.4 },
      };
    },
  },
  recover: {
    label: 'Recovery',
    pose: () => ({ legs: { p: 0.55, a: 0.04 }, arms: { a: 2.0, f: 0.4, e: 0.2 }, s2: { x: -0.2 }, neck: { x: -0.3 } }),
  },
  lunge: {
    label: 'Lunge',
    pose: () => ({
      legL: { f: 1.25, k: 1.7, a: 0.08 }, legR: { f: -0.55, k: 0.35, p: 0.4, a: 0.08 },
      s1: { x: 0.5 }, s2: { x: 0.3 }, neck: { x: -0.2 },
      armL: { f: 1.2, a: 0.4, e: 0.4 }, armR: { f: 1.0, a: 0.6, e: 0.1 },
    }),
  },
  roll: {
    label: 'Spiral to floor',
    pose: () => ({
      root: { z: 1.35 }, legs: { f: 1.4, k: 1.7 },
      s1: { x: 0.45 }, s2: { x: 0.3 }, neck: { x: 0.3 },
      armL: { f: 1.3, e: 0.9, a: 0.2 }, armR: { f: 1.6, a: 0.3, e: 0.3 },
    }),
  },
  crouch: {
    label: 'Rise from floor',
    pose: () => ({
      legs: { f: 1.7, k: 2.4, a: 0.2 }, s1: { x: 0.5 }, s2: { x: 0.35 }, neck: { x: -0.2 },
      arms: { f: 1.25, a: 0.35, e: 0.15 },
    }),
  },
};

// Choose the steps of a phrase from the scores. Threshold rules keep each
// technique's signature moves; the phrase always begins and ends on "stand".
function buildMoves(p) {
  const m = [];
  if (p.grounding < 0.4) m.push('releve', 'extension');
  if (p.torso > 0.6) m.push('contraction', 'release');
  if (p.torso > 0.8 || (p.torso > 0.45 && p.torso <= 0.6)) m.push('spiral');
  if (p.torso > 0.4 && p.torso <= 0.6 && p.structure > 0.7 && p.grounding >= 0.4) m.push('tilt');
  if (p.initiation < 0.4) m.push('reach');
  if (p.initiation > 0.7 && p.dynamics > 0.55 && p.floor < 0.4) m.push('hipL', 'hipR');
  if (p.fall > 0.5) m.push('fall', 'recover');
  if (p.floor > 0.45) m.push('lunge');
  if (p.floor > 0.7) m.push('roll', 'crouch');
  if (p.grounding >= 0.4 && m.length < 3) m.unshift('plie');
  if (m.length < 2) m.push('reach');
  return m;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sustained → gentle ease-in-out; percussive → fast attack that settles.
function ease(t, dyn) {
  const sine = 0.5 - 0.5 * Math.cos(Math.PI * t);
  const sharp = 1 - Math.pow(1 - t, 4);
  return sine + (sharp - sine) * dyn;
}

class PhrasePlayer {
  constructor({ mirror = false, offset = 0 } = {}) {
    this.mirror = mirror;
    this.sig = '';
    this.moves = ['stand'];
    this.order = ['stand'];
    this.idx = 0;
    this.t = offset;
    this.loop = 0;
    this.from = normalize(MOVES.stand.pose({ grounding: 0.3 }));
    this.current = { ...this.from };
  }

  arrange(p) {
    // Codified techniques repeat the same order; improvised ones reshuffle.
    const mid = [...this.moves];
    if (p.structure < 0.5) {
      const r = rng(this.loop * 9973 + 7);
      for (let i = mid.length - 1; i > 0; i--) {
        if (r() < 1 - p.structure) {
          const j = Math.floor(r() * (i + 1));
          [mid[i], mid[j]] = [mid[j], mid[i]];
        }
      }
      // Keep paired moves sensible: rise from floor only after going down.
      const ci = mid.indexOf('crouch');
      const ri = mid.indexOf('roll');
      if (ci > -1 && ri > -1 && ci < ri) [mid[ci], mid[ri]] = [mid[ri], mid[ci]];
    }
    this.order = ['stand', ...mid, 'stand'];
  }

  targetFor(name, p) {
    let pose = normalize(MOVES[name].pose(p));
    // Alternate sides each loop, and the partner dances the mirror image.
    if ((this.loop % 2 === 1) !== this.mirror) pose = mirrorPose(pose);
    return pose;
  }

  update(p, dt, reduceMotion) {
    const moves = buildMoves(p);
    const sig = moves.join(',');
    if (sig !== this.sig) {
      this.sig = sig;
      this.moves = moves;
      this.arrange(p);
      this.from = { ...this.current };
      this.idx = Math.min(1, this.order.length - 1);
      this.t = 0;
    }

    if (reduceMotion) {
      this.idx = 1;
      this.current = this.targetFor(this.order[1], p);
      return this.current;
    }

    const dur = 3.2 - 2.3 * p.dynamics; // seconds per transition
    const hold = p.dynamics * 0.55 * dur; // percussive steps arrive and hold
    this.t += dt;
    const target = this.targetFor(this.order[this.idx], p);
    const k = ease(Math.min(1, this.t / dur), p.dynamics);
    this.current = lerpPose(this.from, target, k);

    if (this.t >= dur + hold) {
      this.from = { ...this.current };
      this.t = 0;
      this.idx++;
      if (this.idx >= this.order.length) {
        this.loop++;
        this.arrange(p);
        this.idx = 1;
      }
    }
    return this.current;
  }

  step() {
    const name = this.order[this.idx];
    return {
      name: MOVES[name].label,
      index: this.idx,
      steps: this.order.map((n) => MOVES[n].label),
    };
  }
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const UP = new THREE.Vector3(0, 1, 0);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 24, 16);

// Builds one dancer. The joint rig (groups) is shared by two "dressings":
//   - flesh: a smooth mannequin body (solid, or a faint outline in skeleton mode)
//   - bones: an anatomical skeleton — skull, vertebrae, ribcage, pelvis,
//            long bones, hands and feet.
function buildBody(mats) {
  const flesh = [];
  const bones = [];
  const place = (list, parent, mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    list.push(mesh);
    return mesh;
  };
  const F = (parent, mesh, x, y, z) => {
    mesh.userData.solid = mesh.material;
    return place(flesh, parent, mesh, x, y, z);
  };
  const B = (parent, mesh, x, y, z) => place(bones, parent, mesh, x, y, z);

  const ellipsoid = (rx, ry, rz, m = mats.bone) => {
    const mesh = new THREE.Mesh(UNIT_SPHERE, m);
    mesh.scale.set(rx, ry, rz);
    return mesh;
  };
  const ball = (r, m = mats.bone) => ellipsoid(r, r, r, m);
  const taper = (len, r1, r2, m = mats.flesh) => {
    const g = new THREE.CylinderGeometry(r1, r2, len, 24, 1);
    g.translate(0, -len / 2, 0);
    return new THREE.Mesh(g, m);
  };
  // A straight bone between two points.
  const shaft = (parent, a, b, r, m = mats.bone) => {
    const A = new THREE.Vector3(...a);
    const Bv = new THREE.Vector3(...b);
    const dir = Bv.clone().sub(A);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, dir.length(), 10, 1), m);
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    return B(parent, mesh, (A.x + Bv.x) / 2, (A.y + Bv.y) / 2, (A.z + Bv.z) / 2);
  };
  // A curved bone (rib, clavicle, jaw) along a smooth path.
  const curved = (parent, pts, r, m = mats.bone) => {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    return B(parent, new THREE.Mesh(new THREE.TubeGeometry(c, 20, r, 6, false), m));
  };
  const vertebra = (parent, y, z, r) => {
    B(parent, new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.9, 12), mats.bone), 0, y, z);
    const spine = B(parent, new THREE.Mesh(new THREE.BoxGeometry(0.008, r * 0.7, r * 1.5), mats.bone), 0, y - r * 0.3, z - r * 1.4);
    spine.rotation.x = 0.45;
    B(parent, ellipsoid(r * 1.7, 0.005, 0.007), 0, y, z - r * 0.5);
  };
  const marker = (parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();

  // ---- Pelvis ----
  const pelvis = group(root, 0, 0.94, 0);
  F(pelvis, ellipsoid(0.15, 0.1, 0.1, mats.flesh), 0, 0.02, 0);
  const sacrum = B(pelvis, ellipsoid(0.034, 0.058, 0.02), 0, 0.035, -0.06);
  sacrum.rotation.x = -0.35;
  for (const s of [1, -1]) {
    const wing = B(pelvis, ellipsoid(0.068, 0.062, 0.015), s * 0.075, 0.06, -0.015);
    wing.rotation.set(0, s * 0.9, -s * 0.3);
    curved(pelvis, [[s * 0.07, -0.03, -0.02], [s * 0.062, -0.085, -0.022], [s * 0.035, -0.08, 0.02]], 0.011);
  }
  curved(pelvis, [[0.085, 0.02, -0.03], [0.075, -0.04, 0.01], [0.04, -0.066, 0.05], [0, -0.06, 0.065], [-0.04, -0.066, 0.05], [-0.075, -0.04, 0.01], [-0.085, 0.02, -0.03]], 0.012);

  // ---- Lumbar spine (5 vertebrae, curving forward) ----
  const s1 = group(pelvis, 0, 0.08, 0);
  F(s1, ellipsoid(0.115, 0.13, 0.085, mats.flesh), 0, 0.1, 0);
  for (let i = 0; i < 5; i++) vertebra(s1, 0.015 + i * 0.038, -0.05 + 0.014 * Math.sin((Math.PI * (i + 0.5)) / 5), 0.022);

  // ---- Thoracic spine, ribcage, sternum, clavicles, shoulder blades ----
  const s2 = group(s1, 0, 0.2, 0);
  F(s2, ellipsoid(0.16, 0.17, 0.105, mats.flesh), 0, 0.12, 0);
  for (let i = 0; i < 10; i++) {
    vertebra(s2, 0.012 + i * 0.026, -0.065 - 0.014 * Math.sin((Math.PI * (i + 0.5)) / 10), 0.02 - 0.005 * (i / 9));
  }
  for (let i = 0; i < 10; i++) {
    const y = 0.235 - i * 0.02;
    const rx = 0.055 + 0.075 * Math.sin((Math.PI * (i + 2)) / 13);
    const dy = 0.035 + 0.004 * i;
    const zf = 0.075 + 0.01 * Math.sin((Math.PI * (i + 1)) / 11);
    for (const s of [1, -1]) {
      const pts = [
        [s * 0.018, y, -0.072],
        [s * rx * 0.7, y + 0.004, -0.085],
        [s * rx, y - dy * 0.35, -0.015],
        [s * rx * 0.85, y - dy * 0.75, zf * 0.75],
      ];
      if (i < 7) pts.push([s * 0.02, y - dy, zf]); // true ribs reach the sternum
      else if (i < 9) pts.push([s * 0.06, y - dy * 0.95, zf * 0.95]); // false ribs
      else pts.splice(3, 1, [s * rx * 0.9, y - dy * 0.6, 0.03]); // floating rib
      curved(s2, pts, 0.0062);
    }
  }
  const sternum = B(s2, ellipsoid(0.017, 0.072, 0.009), 0, 0.13, 0.086);
  sternum.rotation.x = -0.12;
  for (const s of [1, -1]) {
    curved(s2, [[s * 0.02, 0.215, 0.085], [s * 0.09, 0.235, 0.07], [s * 0.17, 0.235, 0.0]], 0.0085);
    const scap = B(s2, ellipsoid(0.05, 0.07, 0.008), s * 0.11, 0.17, -0.095);
    scap.rotation.set(0, -s * 0.4, s * 0.15);
  }

  // ---- Neck (cervical vertebrae) and skull ----
  const neck = group(s2, 0, 0.27, 0);
  F(neck, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.11, 16), mats.flesh), 0, 0.04, 0);
  for (let i = 0; i < 4; i++) vertebra(neck, i * 0.022, -0.015, 0.013);
  const head = group(neck, 0, 0.09, 0);
  F(head, ellipsoid(0.085, 0.11, 0.1, mats.flesh), 0, 0.1, 0.005);
  F(head, ellipsoid(0.017, 0.026, 0.02, mats.fleshJoint), 0, 0.085, 0.1);
  B(head, ellipsoid(0.075, 0.085, 0.095), 0, 0.13, -0.01); // cranium
  B(head, ellipsoid(0.056, 0.05, 0.055), 0, 0.075, 0.035); // face
  for (const s of [1, -1]) {
    B(head, ellipsoid(0.02, 0.017, 0.012, mats.socket), s * 0.027, 0.1, 0.083); // eye socket
    B(head, ellipsoid(0.012, 0.01, 0.028), s * 0.052, 0.08, 0.045); // cheekbone
  }
  B(head, ellipsoid(0.008, 0.014, 0.006, mats.socket), 0, 0.072, 0.088); // nasal cavity
  B(head, new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.011, 0.008), mats.bone), 0, 0.042, 0.083); // teeth
  curved(head, [[0.05, 0.075, 0], [0.047, 0.035, 0.02], [0.03, 0.018, 0.06], [0, 0.014, 0.073], [-0.03, 0.018, 0.06], [-0.047, 0.035, 0.02], [-0.05, 0.075, 0]], 0.009); // jaw

  const contacts = [
    marker(pelvis, 0, -0.08, 0),
    marker(pelvis, 0, 0, -0.1),
    marker(s2, 0, 0.12, -0.1),
    marker(s2, 0.16, 0.2, 0),
    marker(s2, -0.16, 0.2, 0),
    marker(head, 0, 0.21, 0),
    marker(head, 0, 0.1, -0.1),
    marker(head, 0.085, 0.1, 0),
    marker(head, -0.085, 0.1, 0),
  ];

  // ---- Arms: humerus, radius & ulna, hand bones ----
  const arms = [1, -1].map((s) => {
    const shoulder = group(s2, s * 0.19, 0.23, 0);
    F(shoulder, ball(0.05, mats.fleshJoint));
    const upper = group(shoulder);
    F(upper, taper(0.29, 0.047, 0.036));
    B(upper, ball(0.026));
    shaft(upper, [0, -0.02, 0], [0, -0.265, 0], 0.012);
    B(upper, ellipsoid(0.026, 0.014, 0.016), 0, -0.28, 0);

    const fore = group(upper, 0, -0.29, 0);
    F(fore, ball(0.037, mats.fleshJoint));
    F(fore, taper(0.25, 0.035, 0.026));
    B(fore, ball(0.014), 0, 0, -0.012);
    shaft(fore, [0, -0.01, 0.009], [0, -0.24, 0.011], 0.0075); // radius
    shaft(fore, [0, -0.005, -0.009], [0, -0.24, -0.007], 0.0075); // ulna

    const wrist = group(fore, 0, -0.25, 0);
    F(wrist, ellipsoid(0.028, 0.075, 0.045, mats.flesh), 0, -0.07, 0);
    B(wrist, ellipsoid(0.012, 0.016, 0.022), 0, -0.015, 0); // carpals
    const fingerLen = [0.045, 0.05, 0.047, 0.038];
    fingerLen.forEach((ph, j) => {
      const z = 0.016 - j * 0.011;
      shaft(wrist, [0, -0.03, z * 0.8], [0, -0.08, z], 0.0042);
      shaft(wrist, [0, -0.084, z], [-s * 0.008, -0.084 - ph, z * 1.05], 0.0036);
    });
    shaft(wrist, [-s * 0.004, -0.02, 0.02], [-s * 0.014, -0.055, 0.035], 0.0045); // thumb
    shaft(wrist, [-s * 0.014, -0.058, 0.036], [-s * 0.02, -0.085, 0.04], 0.004);
    const tip = marker(wrist, 0, -0.15, 0);
    contacts.push(tip, marker(fore, 0, 0, 0));
    return { s, upper, fore, tip };
  });

  // ---- Legs: femur, patella, tibia & fibula, foot bones ----
  const legs = [1, -1].map((s) => {
    const hip = group(pelvis, s * 0.09, -0.02, 0);
    F(hip, ball(0.075, mats.fleshJoint));
    const thigh = group(hip);
    F(thigh, taper(0.44, 0.075, 0.05));
    B(thigh, ball(0.024));
    shaft(thigh, [0, 0, 0], [s * 0.035, -0.03, 0], 0.012); // femoral neck
    B(thigh, ball(0.018), s * 0.04, -0.03, -0.005); // greater trochanter
    shaft(thigh, [s * 0.035, -0.04, 0], [s * 0.005, -0.41, 0.005], 0.014);
    B(thigh, ellipsoid(0.034, 0.02, 0.028), 0, -0.425, 0);

    const shin = group(thigh, 0, -0.44, 0);
    F(shin, ball(0.052, mats.fleshJoint));
    F(shin, taper(0.43, 0.05, 0.034));
    B(shin, ellipsoid(0.017, 0.021, 0.009), 0, 0.012, 0.035); // patella
    B(shin, ellipsoid(0.034, 0.012, 0.026), 0, -0.012, 0);
    shaft(shin, [-s * 0.004, -0.02, 0.004], [-s * 0.008, -0.405, 0], 0.013); // tibia
    shaft(shin, [s * 0.024, -0.03, -0.008], [s * 0.02, -0.41, -0.006], 0.0065); // fibula
    B(shin, ball(0.011), -s * 0.014, -0.418, 0);
    B(shin, ball(0.011), s * 0.022, -0.425, -0.006);

    const foot = group(shin, 0, -0.43, 0);
    F(foot, ball(0.036, mats.fleshJoint));
    F(foot, ellipsoid(0.042, 0.035, 0.12, mats.flesh), 0, -0.04, 0.06);
    B(foot, ellipsoid(0.017, 0.013, 0.02), 0, -0.022, 0.005); // talus
    B(foot, ellipsoid(0.018, 0.022, 0.035), 0, -0.05, -0.02); // heel bone
    B(foot, ellipsoid(0.03, 0.014, 0.022), 0, -0.048, 0.04); // midfoot
    for (let j = 0; j < 5; j++) {
      const x = -s * (0.022 - j * 0.011);
      shaft(foot, [x * 0.55, -0.05, 0.055], [x, -0.066, 0.125], j === 0 ? 0.0065 : 0.0045);
      shaft(foot, [x, -0.068, 0.13], [x * 1.05, -0.07, j === 0 ? 0.17 : 0.16], j === 0 ? 0.0055 : 0.0038);
    }
    const heel = marker(foot, 0, -0.072, -0.045);
    const toe = marker(foot, 0, -0.072, 0.175);
    contacts.push(heel, toe, marker(shin, 0, 0, 0.05));
    return { s, thigh, shin, foot, heel, toe };
  });

  return { root, pelvis, s1, s2, neck, arms, legs, contacts, flesh, bones };
}

// Skeleton mode shows bones inside a faint body outline; body mode shows the
// solid mannequin.
function setBodyStyle(body, style, ghost) {
  const skel = style === 'skeleton';
  body.flesh.forEach((m) => {
    m.material = skel ? ghost : m.userData.solid;
    m.castShadow = !skel;
  });
  body.bones.forEach((m) => (m.visible = skel));
}

function applyPose(body, P) {
  body.root.rotation.set(P['root.x'], 0, P['root.z']);
  body.pelvis.rotation.set(P['pelvis.x'], P['pelvis.y'], P['pelvis.z']);
  body.pelvis.position.x = P['pelvis.shift'];
  body.s1.rotation.set(P['s1.x'], P['s1.y'], P['s1.z']);
  body.s2.rotation.set(P['s2.x'], P['s2.y'], P['s2.z']);
  body.neck.rotation.set(P['neck.x'], P['neck.y'], P['neck.z']);
  body.arms.forEach(({ s, upper, fore }) => {
    const g = s > 0 ? 'armL' : 'armR';
    upper.rotation.set(-P[`${g}.f`], s * P[`${g}.t`], s * P[`${g}.a`]);
    fore.rotation.set(-P[`${g}.e`], 0, 0);
  });
  body.legs.forEach(({ s, thigh, shin, foot }) => {
    const g = s > 0 ? 'legL' : 'legR';
    const f = P[`${g}.f`];
    const k = P[`${g}.k`];
    thigh.rotation.set(-f, s * P[`${g}.t`], s * P[`${g}.a`]);
    shin.rotation.set(k, 0, 0);
    // Keep the sole level with the floor, plus any point of the foot.
    foot.rotation.set(P[`${g}.p`] - (P['root.x'] + P['pelvis.x'] - f + k), 0, 0);
  });
}

// Put the lowest part of the body on the floor and keep the dancer centred
// over its feet, so the body never floats or sinks whatever the pose.
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
function settle(body, baseX) {
  body.root.position.set(0, 0, 0);
  body.root.updateMatrixWorld(true);
  let minY = Infinity;
  for (const c of body.contacts) {
    c.getWorldPosition(tmp);
    if (tmp.y < minY) minY = tmp.y;
  }
  body.pelvis.getWorldPosition(tmp);
  body.legs[0].heel.getWorldPosition(tmp2);
  let fx = tmp2.x;
  let fz = tmp2.z;
  body.legs[1].heel.getWorldPosition(tmp2);
  fx = (fx + tmp2.x) / 2;
  fz = (fz + tmp2.z) / 2;
  const cx = (tmp.x + fx) / 2;
  const cz = (tmp.z + fz) / 2;
  body.root.position.set(baseX - cx, -minY, -cz);
  body.root.updateMatrixWorld(true);
}

// Gentle, always-on life: breathing and a slight postural sway, plus some
// wandering in improvised techniques so holds never look frozen.
function addLife(P, p, time, phase) {
  const out = { ...P };
  out['s2.x'] += Math.sin(time * 1.3 + phase) * 0.025;
  out['neck.x'] += Math.sin(time * 1.3 + phase + 0.6) * 0.015;
  out['root.z'] += Math.sin(time * 0.6 + phase) * 0.012;
  const free = 1 - p.structure;
  out['armL.a'] += Math.sin(time * 0.9 + phase) * 0.18 * free;
  out['armR.a'] += Math.sin(time * 0.77 + phase + 2) * 0.18 * free;
  out['s1.y'] += Math.sin(time * 0.5 + phase + 1) * 0.12 * free;
  return out;
}

export function createFigureScene(container, { trail = true, style: initialStyle = 'skeleton' } = {}) {
  let style = initialStyle;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const lookAt = new THREE.Vector3(0, 0.95, 0); // frames a full overhead reach

  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2.5;
  key.shadow.camera.right = 2.5;
  key.shadow.camera.top = 2.5;
  key.shadow.camera.bottom = -2.5;
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-3, 2.5, -2.5);
  scene.add(rim);

  const bodyColor = cssVar('--figure', '#e8dcc8');
  const boneColor = cssVar('--bone', '#e6dcc6');
  const socketColor = cssVar('--socket', '#221d17');
  const accent = cssVar('--accent', '#e0603a');
  const GHOST = 0.14; // opacity of the body outline around the skeleton

  function makeMats(fleshColor, boneTint, fade) {
    const opts = (extra) => ({ roughness: 0.6, metalness: 0.02, transparent: fade, opacity: fade ? 0 : 1, ...extra });
    return {
      flesh: new THREE.MeshStandardMaterial(opts({ color: fleshColor })),
      fleshJoint: new THREE.MeshStandardMaterial(opts({ color: new THREE.Color(fleshColor).multiplyScalar(0.72), roughness: 0.5 })),
      ghost: new THREE.MeshStandardMaterial({ color: fleshColor, roughness: 0.8, transparent: true, opacity: fade ? 0 : GHOST, depthWrite: false }),
      bone: new THREE.MeshStandardMaterial(opts({ color: boneTint, roughness: 0.5 })),
      socket: new THREE.MeshStandardMaterial(opts({ color: socketColor, roughness: 0.9 })),
    };
  }
  const mainMats = makeMats(bodyColor, boneColor, false);
  const partnerMats = makeMats(accent, new THREE.Color(boneColor).lerp(new THREE.Color(accent), 0.55), true);

  const dancer = buildBody(mainMats);
  const partner = buildBody(partnerMats);
  scene.add(dancer.root, partner.root);

  function setStyle(s) {
    style = s;
    setBodyStyle(dancer, s, mainMats.ghost);
    setBodyStyle(partner, s, partnerMats.ghost);
  }
  setStyle(style);

  // Floor: catches real shadows, plus a thin ring marking the dance space.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ringPts = [];
  for (let i = 0; i <= 96; i++) {
    const th = (i / 96) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(th) * 1.4, 0.001, Math.sin(th) * 1.4));
  }
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({ color: cssVar('--line', '#555'), transparent: true, opacity: 0.6 })
    )
  );

  // Trace of the right hand: smooth arcs for sustained, angular for percussive.
  const TRAIL_N = 120;
  const trailPos = new Float32Array(TRAIL_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.55 }));
  trailLine.frustumCulled = false;
  trailLine.visible = trail;
  scene.add(trailLine);
  let trailFilled = false;

  const current = Object.fromEntries(AXES.map((k) => [k, 0.5]));
  let target = { ...current };
  const lead = new PhrasePlayer();
  const follow = new PhrasePlayer({ mirror: true, offset: 0.4 });

  let wide = 4.6;
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Pull back on narrow screens so a duet or a fall still fits.
    wide = width / height < 0.8 ? 7.2 : 5.6;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(container);

  const handWorld = new THREE.Vector3();
  let time = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible) return;
    time += dt;
    const blend = 1 - Math.exp(-dt * 3);
    AXES.forEach((k) => (current[k] += (target[k] - current[k]) * blend));

    // Partner appears only for genuinely partnered work.
    const cRaw = Math.min(1, Math.max(0, (current.contact - 0.3) / 0.5));
    const c = cRaw * cRaw * (3 - 2 * cRaw);

    const P1 = addLife(lead.update(current, dt, reduceMotion), current, time, 0);
    P1['root.z'] -= c * 0.22; // lean toward the partner
    applyPose(dancer, P1);
    settle(dancer, -c * 0.62);

    partner.root.visible = c > 0.01;
    if (partner.root.visible) {
      const P2 = addLife(follow.update(current, dt, reduceMotion), current, time, 1.7);
      P2['root.z'] += c * 0.22;
      applyPose(partner, P2);
      settle(partner, c * 0.62);
    }
    for (const [k, m] of Object.entries(partnerMats)) m.opacity = k === 'ghost' ? c * GHOST : c;

    // Slow, subtle camera drift gives depth without distracting.
    const ang = 0.18 + Math.sin(time * 0.12) * 0.12;
    camera.position.set(Math.sin(ang) * wide, 1.3, Math.cos(ang) * wide);
    camera.lookAt(lookAt);

    if (trail) {
      dancer.arms[1].tip.getWorldPosition(handWorld);
      if (!trailFilled) {
        for (let i = 0; i < TRAIL_N; i++) handWorld.toArray(trailPos, i * 3);
        trailFilled = true;
      }
      trailPos.copyWithin(0, 3);
      handWorld.toArray(trailPos, (TRAIL_N - 1) * 3);
      trailGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }
  frame();

  return {
    setTarget(params) {
      target = { ...target, ...params };
    },
    getCurrent: () => ({ ...current }),
    getStep: () => lead.step(),
    setStyle,
    snap(params) {
      Object.assign(current, params);
      target = { ...current };
    },
  };
}
