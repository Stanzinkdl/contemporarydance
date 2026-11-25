import * as THREE from 'three';
import { SKELETON, loadBoneGeometries, joint, offset } from './skeleton.js';
import { MOVES, PHRASES, KEYS, normalize, mirrorPose, lerpPose } from './phrases.js';
import { createOrbit } from './orbit.js';

// The dancer: an anatomical skeleton (BodyParts3D) on a rig whose joints are
// measured from those bones, dancing technique-specific phrases.
//
// The rig has 24 moving segments: pelvis, lumbar spine, lower thorax, upper
// chest, neck, head, and on each side the shoulder girdle (clavicle + scapula),
// upper arm, forearm, hand, fingers, thigh, shin, foot and toes.
//
// Every step blends from wherever the body currently is; sustained techniques
// flow through their poses on a smooth curve, percussive ones strike and hold.

// ?cam=side starts the camera in profile.
const START_VIEW = new URLSearchParams(location.search).get('cam');

const AXES = ['grounding', 'torso', 'dynamics', 'floor', 'initiation', 'structure', 'fall', 'contact'];

// ---------------------------------------------------------------------------
// Phrase player
// ---------------------------------------------------------------------------
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

// Catmull-Rom through four poses: passes through p1 and p2 without stopping.
function splinePose(p0, p1, p2, p3, t) {
  const out = {};
  const t2 = t * t;
  const t3 = t2 * t;
  for (const k of KEYS) {
    const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
    out[k] = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  }
  return out;
}

class PhrasePlayer {
  constructor({ role = 'lead', mirror = false, offset: startOffset = 0 } = {}) {
    this.role = role;
    this.mirror = mirror;
    this.startOffset = startOffset;
    this.sig = '';
    this.order = [['stand', 1]];
    this.idx = 0;
    this.t = 0;
    this.loop = 0;
    this.duet = false;
    this.from = normalize(MOVES.stand.pose({ grounding: 0.3 }));
    this.prev = this.from;
    this.current = { ...this.from };
  }

  arrange(def, p) {
    const steps = (this.role === 'partner' && def.partner) || def.steps;
    const mid = steps.map((s) => [...s]);
    // Improvised techniques reshuffle their material each time round;
    // duets and classes keep a fixed order.
    if (!def.duet && !def.fixed && p.structure < 0.5) {
      const r = rng(this.loop * 9973 + 7);
      for (let i = mid.length - 1; i > 0; i--) {
        if (r() < 1 - p.structure) {
          const j = Math.floor(r() * (i + 1));
          [mid[i], mid[j]] = [mid[j], mid[i]];
        }
      }
    }
    this.order = [['stand', 1], ...mid, ['stand', 1]];
  }

  targetFor(name, p, loop = this.loop) {
    let pose = normalize(MOVES[name].pose(p));
    // Solo phrases alternate sides each time round; a partner dances the mirror image.
    const flipLoop = !this.duet && loop % 2 === 1;
    if (flipLoop !== this.mirror) pose = mirrorPose(pose);
    return pose;
  }

  update(p, dt, phraseId, reduceMotion) {
    const def = PHRASES[phraseId] || PHRASES.intro;
    if (phraseId !== this.sig) {
      this.sig = phraseId;
      this.duet = !!def.duet;
      this.loop = 0;
      this.arrange(def, p);
      this.prev = this.from = { ...this.current };
      this.idx = 1;
      this.t = this.duet || def.fixed ? 0 : this.startOffset;
    }

    if (reduceMotion) {
      this.idx = 1;
      this.current = this.targetFor(this.order[1][0], p);
      return this.current;
    }

    const [name, beats] = this.order[this.idx];
    const dur = (3.2 - 2.3 * p.dynamics) * beats;
    const hold = p.dynamics * 0.55 * dur;
    this.t += dt;
    const u = Math.min(1, this.t / dur);
    const target = this.targetFor(name, p);
    const linear = lerpPose(this.from, target, ease(u, p.dynamics));
    // Flow: sustained techniques curve through the poses instead of stopping.
    const flow = (1 - p.dynamics) * 0.85;
    if (flow > 0.02) {
      const nextIdx = this.idx + 1 < this.order.length ? this.idx + 1 : 1;
      const next = this.targetFor(this.order[nextIdx][0], p, nextIdx === 1 ? this.loop + 1 : this.loop);
      this.current = lerpPose(linear, splinePose(this.prev, this.from, target, next, u), flow);
    } else this.current = linear;

    if (this.t >= dur + hold) {
      this.prev = this.from;
      this.from = { ...this.current };
      this.t = 0;
      this.idx++;
      if (this.idx >= this.order.length) {
        this.loop++;
        this.arrange(def, p);
        this.idx = 1;
      }
    }
    return this.current;
  }

  step() {
    return {
      name: MOVES[this.order[this.idx][0]].label,
      index: this.idx,
      steps: this.order.map(([n]) => MOVES[n].label),
    };
  }
}

// ---------------------------------------------------------------------------
// Body: rig from measured joints + flesh shapes + anatomical bones
// ---------------------------------------------------------------------------
export function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const UP = new THREE.Vector3(0, 1, 0);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 28, 18);

export const GHOST = 0.13; // opacity of the body outline around the skeleton

export function makeMats(fleshColor, boneTint, fade) {
  const opts = (extra) => ({ roughness: 0.6, metalness: 0.02, transparent: fade, opacity: fade ? 0 : 1, ...extra });
  return {
    flesh: new THREE.MeshStandardMaterial(opts({ color: fleshColor })),
    fleshJoint: new THREE.MeshStandardMaterial(opts({ color: new THREE.Color(fleshColor).multiplyScalar(0.72), roughness: 0.5 })),
    ghost: new THREE.MeshStandardMaterial({ color: fleshColor, roughness: 0.8, transparent: true, opacity: fade ? 0 : GHOST, depthWrite: false }),
    bone: new THREE.MeshStandardMaterial(opts({ color: boneTint, roughness: 0.55 })),
    cartilage: new THREE.MeshStandardMaterial(opts({ color: new THREE.Color(boneTint).lerp(new THREE.Color('#9fb7c4'), 0.45), roughness: 0.35 })),
  };
}

export function buildBody(mats) {
  const flesh = [];
  const group = (parent, pos = new THREE.Vector3()) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    parent.add(g);
    return g;
  };
  const fleshMesh = (parent, mesh) => {
    mesh.userData.solid = mesh.material;
    mesh.castShadow = true;
    parent.add(mesh);
    flesh.push(mesh);
    return mesh;
  };
  const ellipsoid = (parent, c, r, m = mats.flesh) => {
    const mesh = new THREE.Mesh(UNIT_SPHERE, m);
    mesh.position.copy(c);
    mesh.scale.set(...r);
    return fleshMesh(parent, mesh);
  };
  // Tapered limb from the group's origin to `to` (a child joint offset).
  const limb = (parent, to, r1, r2, ball = true) => {
    const len = to.length();
    const geo = new THREE.CylinderGeometry(r2, r1, len, 24, 1);
    geo.translate(0, len / 2, 0);
    const mesh = new THREE.Mesh(geo, mats.flesh);
    mesh.quaternion.setFromUnitVectors(UP, to.clone().normalize());
    fleshMesh(parent, mesh);
    if (ball) ellipsoid(parent, new THREE.Vector3(), [r1, r1, r1], mats.fleshJoint);
  };

  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // pitch/roll in the body's frame, then facing

  // Spine: pelvis → lumbar → lower thorax → upper chest → neck → head.
  const pelvis = group(root, joint('midHip'));
  const s1 = group(pelvis, offset('lumbosacral', 'midHip'));
  const s2 = group(s1, offset('thoracolumbar', 'lumbosacral'));
  const s3 = group(s2, offset('chestJoint', 'thoracolumbar'));
  const neck = group(s3, offset('cervicothoracic', 'chestJoint'));
  const head = group(neck, offset('atlanto', 'cervicothoracic'));

  ellipsoid(pelvis, new THREE.Vector3(0, 0.04, -0.01), [0.165, 0.11, 0.115]);
  ellipsoid(s1, new THREE.Vector3(0, 0.08, 0.02), [0.13, 0.12, 0.1]);
  ellipsoid(s2, new THREE.Vector3(0, 0.08, 0.03), [0.15, 0.12, 0.11]);
  ellipsoid(s3, new THREE.Vector3(0, 0.03, 0.045), [0.165, 0.13, 0.115]);
  limb(neck, offset('atlanto', 'cervicothoracic'), 0.05, 0.045);
  ellipsoid(head, new THREE.Vector3(0, 0.085, 0.025), [0.082, 0.112, 0.1]);
  ellipsoid(head, new THREE.Vector3(0, 0.075, 0.125), [0.016, 0.024, 0.018], mats.fleshJoint); // nose

  const segs = { pelvis, lumbar: s1, thorax: s2, chest: s3, neck, head };

  const arms = [['L', 1], ['R', -1]].map(([S, s]) => {
    // The shoulder girdle (collarbone + shoulder blade) pivots at the sternum.
    const girdle = group(s3, offset(`sc${S}`, 'chestJoint'));
    const upper = group(girdle, offset(`shoulder${S}`, `sc${S}`));
    const fore = group(upper, offset(`elbow${S}`, `shoulder${S}`));
    const wrist = group(fore, offset(`wrist${S}`, `elbow${S}`));
    const fingers = group(wrist, offset(`mcp${S}`, `wrist${S}`));
    limb(girdle, offset(`shoulder${S}`, `sc${S}`), 0.03, 0.045, false);
    limb(upper, offset(`elbow${S}`, `shoulder${S}`), 0.048, 0.037);
    limb(fore, offset(`wrist${S}`, `elbow${S}`), 0.037, 0.026);
    const palm = offset(`mcp${S}`, `wrist${S}`);
    const pm = ellipsoid(wrist, palm.clone().multiplyScalar(0.5), [0.03, 0.05, 0.044]);
    pm.quaternion.setFromUnitVectors(UP, palm.clone().normalize());
    const digits = offset(`fingerTip${S}`, `mcp${S}`);
    const dm = ellipsoid(fingers, digits.clone().multiplyScalar(0.5), [0.02, digits.length() * 0.6, 0.04]);
    dm.quaternion.setFromUnitVectors(UP, digits.clone().normalize());
    const tip = new THREE.Object3D();
    tip.position.copy(digits);
    fingers.add(tip);
    Object.assign(segs, { [`girdle${S}`]: girdle, [`upperArm${S}`]: upper, [`foreArm${S}`]: fore, [`hand${S}`]: wrist, [`fingers${S}`]: fingers });
    return { S, s, girdle, upper, fore, wrist, fingers, tip };
  });

  const legs = [['L', 1], ['R', -1]].map(([S, s]) => {
    const hip = group(pelvis, offset(`hip${S}`, 'midHip'));
    const thigh = group(hip);
    const shin = group(thigh, offset(`knee${S}`, `hip${S}`));
    const foot = group(shin, offset(`ankle${S}`, `knee${S}`));
    const toes = group(foot, offset(`mtp${S}`, `ankle${S}`));
    limb(thigh, offset(`knee${S}`, `hip${S}`), 0.075, 0.05);
    limb(shin, offset(`ankle${S}`, `knee${S}`), 0.052, 0.034);
    const footAxis = offset(`mtp${S}`, `ankle${S}`);
    const f = ellipsoid(foot, new THREE.Vector3(footAxis.x * 0.45, -0.028, 0.03), [0.042, 0.032, 0.1]);
    f.rotation.y = Math.atan2(footAxis.x, footAxis.z);
    const toeAxis = offset(`toeTip${S}`, `mtp${S}`);
    ellipsoid(toes, toeAxis.clone().multiplyScalar(0.5), [0.04, 0.016, 0.035]);
    Object.assign(segs, { [`thigh${S}`]: thigh, [`shin${S}`]: shin, [`foot${S}`]: foot, [`toes${S}`]: toes });
    return { S, s, thigh, shin, foot, toes };
  });

  // Contact points (extremes of each bone) keep the body on the floor.
  const contacts = [];
  for (const e of SKELETON.entries) {
    for (const c of e.contacts) {
      const o = new THREE.Object3D();
      o.position.set(...c);
      segs[e.seg].add(o);
      contacts.push(o);
    }
  }

  return { root, pelvis, s1, s2, s3, neck, head, arms, legs, contacts, flesh, bones: [], segs };
}

export function attachBones(body, geos, mats) {
  for (const [seg, parts] of Object.entries(geos)) {
    for (const { mat, geometry } of parts) {
      const m = new THREE.Mesh(geometry, mat === 'cart' ? mats.cartilage : mats.bone);
      m.castShadow = true;
      body.segs[seg].add(m);
      body.bones.push(m);
    }
  }
}

// Skeleton mode shows bones inside a faint body outline; body mode shows the
// solid figure.
export function setBodyStyle(body, style, ghost) {
  const skel = style === 'skeleton';
  body.flesh.forEach((m) => {
    m.material = skel ? ghost : m.userData.solid;
    m.castShadow = !skel;
  });
  body.bones.forEach((m) => (m.visible = skel));
}

const tmpV = new THREE.Vector3();
function applyPose(body, P) {
  body.root.rotation.set(P['root.x'], P['root.y'], P['root.z']);
  body.pelvis.rotation.set(P['pelvis.x'], P['pelvis.y'], P['pelvis.z']);
  body.pelvis.position.x = joint('midHip').x + P['pelvis.shift'];
  body.s1.rotation.set(P['s1.x'], P['s1.y'], P['s1.z']);
  body.s2.rotation.set(P['s2.x'], P['s2.y'], P['s2.z']);
  body.s3.rotation.set(P['s3.x'], P['s3.y'], P['s3.z']);
  body.neck.rotation.set(P['neck.x'], P['neck.y'], P['neck.z']);
  body.head.rotation.set(P['head.x'], P['head.y'], P['head.z']);
  body.arms.forEach(({ S, s, girdle, upper, fore, wrist, fingers }) => {
    const g = `arm${S}`;
    const f = P[`${g}.f`];
    const a = P[`${g}.a`];
    // Scapulohumeral rhythm: past ~60° the shoulder blade rotates upward and
    // the collarbone lifts, as in a real shoulder.
    tmpV.set(0, -1, 0).applyEuler(new THREE.Euler(-f, 0, s * a));
    const elevation = Math.acos(THREE.MathUtils.clamp(-tmpV.y, -1, 1));
    const rhythm = Math.max(0, elevation - 1.0) * 0.28;
    girdle.rotation.set(-0.12 * P[`${g}.pr`], -s * 0.25 * P[`${g}.pr`], s * (rhythm + 0.25 * P[`${g}.sh`]));
    upper.rotation.set(-f, s * P[`${g}.t`], s * a - s * rhythm);
    fore.rotation.set(-P[`${g}.e`], 0, 0);
    wrist.rotation.set(-P[`${g}.w`], 0, 0);
    fingers.rotation.set(-P[`${g}.c`], 0, 0);
  });
  body.legs.forEach(({ S, s, thigh, shin, foot, toes }) => {
    const g = `leg${S}`;
    const f = P[`${g}.f`];
    const k = P[`${g}.k`];
    const point = P[`${g}.p`];
    // Turnout rotates the leg outward around its own length.
    thigh.rotation.set(-f, s * P[`${g}.t`], s * P[`${g}.a`], 'XZY');
    shin.rotation.set(k, 0, 0);
    // Keep the sole level with the floor, plus any point of the foot.
    foot.rotation.set(point - (P['root.x'] + P['pelvis.x'] - f + k), 0, 0);
    // On half-toe (d = 1) the toes stay flat on the floor; otherwise they extend the point.
    toes.rotation.set(-point * P[`${g}.d`] + point * 0.35 * (1 - P[`${g}.d`]), 0, 0);
  });
}

// Put the lowest point of the skeleton on the floor, keep the dancer centred
// over its feet, then add any travelling step or jump.
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
function settle(body, baseX, P) {
  body.root.position.set(0, 0, 0);
  body.root.updateMatrixWorld(true);
  let minY = Infinity;
  for (const c of body.contacts) {
    c.getWorldPosition(tmp);
    if (tmp.y < minY) minY = tmp.y;
  }
  body.pelvis.getWorldPosition(tmp);
  body.legs[0].foot.getWorldPosition(tmp2);
  let fx = tmp2.x;
  let fz = tmp2.z;
  body.legs[1].foot.getWorldPosition(tmp2);
  fx = (fx + tmp2.x) / 2;
  fz = (fz + tmp2.z) / 2;
  const cx = (tmp.x + fx) / 2;
  const cz = (tmp.z + fz) / 2;
  body.root.position.set(baseX - cx + P['travel.x'], -minY + Math.max(0, P.lift), -cz + P['travel.z']);
  body.root.updateMatrixWorld(true);
}

// Gentle, always-on life: breathing, slight sway, wandering in improvised
// techniques, and Gaga-style shaking when a step asks for it.
function addLife(P, p, time, phase) {
  const out = { ...P };
  out['s3.x'] += Math.sin(time * 1.3 + phase) * 0.018;
  out['s2.x'] += Math.sin(time * 1.3 + phase) * 0.008;
  out['head.x'] += Math.sin(time * 1.3 + phase + 0.6) * 0.012;
  out['root.z'] += Math.sin(time * 0.6 + phase) * 0.008;
  out['armL.c'] += Math.sin(time * 0.7 + phase) * 0.06;
  out['armR.c'] += Math.sin(time * 0.63 + phase + 1) * 0.06;
  const free = 1 - p.structure;
  out['armL.a'] += Math.sin(time * 0.9 + phase) * 0.12 * free;
  out['armR.a'] += Math.sin(time * 0.77 + phase + 2) * 0.12 * free;
  out['s1.y'] += Math.sin(time * 0.5 + phase + 1) * 0.08 * free;
  if (P.shake > 0.01) {
    const q = P.shake * 0.05;
    ['s1.x', 's2.z', 's3.y', 'neck.y', 'head.x', 'armL.a', 'armR.a', 'armL.e', 'armR.e', 'armL.c', 'armR.c', 'legL.k', 'legR.k'].forEach((k, i) => {
      out[k] += Math.sin(time * (27 + i * 3.1) + i) * q;
    });
  }
  return out;
}

export function createFigureScene(container, { trail = true, style: initialStyle = 'skeleton', scrollFriendly = false } = {}) {
  let style = initialStyle;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  camera.position.set(1, 1.35, 5.6);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5 });
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-3, 2.5, -2.5);
  scene.add(rim);

  const bodyColor = cssVar('--figure', '#e8dcc8');
  const boneColor = cssVar('--bone', '#e6dcc6');
  const accent = cssVar('--accent', '#e0603a');
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
  loadBoneGeometries()
    .then((geos) => {
      attachBones(dancer, geos, mainMats);
      attachBones(partner, geos, partnerMats);
      setStyle(style);
    })
    .catch((err) => console.warn('Skeleton meshes unavailable:', err));

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
  const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.5 }));
  trailLine.frustumCulled = false;
  trailLine.visible = trail;
  scene.add(trailLine);
  let trailFilled = false;

  const current = Object.fromEntries(AXES.map((k) => [k, 0.5]));
  let target = { ...current };
  let phraseId = 'intro';
  const lead = new PhrasePlayer();
  const follow = new PhrasePlayer({ role: 'partner', mirror: true, offset: 0.4 });

  const orbit = createOrbit({ camera, renderer, container, height: 0.9, scrollFriendly, initialView: START_VIEW });

  let wide = 5.6;
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
  const centre = new THREE.Vector3();
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
    const duet = !!PHRASES[phraseId]?.duet;

    const P1 = addLife(lead.update(current, dt, phraseId, reduceMotion), current, time, 0);
    if (!duet) P1['root.z'] -= c * 0.22; // lean toward the partner
    applyPose(dancer, P1);
    settle(dancer, -c * 0.62, P1);

    partner.root.visible = c > 0.01;
    if (partner.root.visible) {
      const P2 = addLife(follow.update(current, dt, phraseId, reduceMotion), current, time, 1.7);
      if (!duet) P2['root.z'] += c * 0.22;
      applyPose(partner, P2);
      settle(partner, c * 0.62, P2);
    }
    for (const [k, m] of Object.entries(partnerMats)) m.opacity = k === 'ghost' ? c * GHOST : c;

    // The camera follows the dancer's travelling steps.
    dancer.pelvis.getWorldPosition(centre);
    if (partner.root.visible) centre.x *= 1 - c;
    orbit.update({ follow: centre, time, distance: wide });

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
    // params: the eight scores; phrase: which phrase (technique or class section) to dance.
    setTarget(params, phrase) {
      target = { ...target, ...params };
      if (phrase) phraseId = phrase;
    },
    getCurrent: () => ({ ...current }),
    getStep: () => lead.step(),
    setStyle,
    setView: orbit.setView,
    snap(params) {
      Object.assign(current, params);
      target = { ...current };
    },
  };
}

// ---------------------------------------------------------------------------
// Still figures for the step gallery: one shared off-screen renderer poses the
// skeleton in a given step, frames it, and returns a snapshot image.
// ---------------------------------------------------------------------------
let thumbCtx = null;
const thumbCache = new Map();
async function getThumbCtx() {
  if (thumbCtx) return thumbCtx;
  const geos = await loadBoneGeometries();
  const W = 240;
  const H = 280;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-3, 2.5, -2.5);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const mats = makeMats(cssVar('--figure', '#e8dcc8'), cssVar('--bone', '#e6dcc6'), false);
  const body = buildBody(mats);
  attachBones(body, geos, mats);
  setBodyStyle(body, 'skeleton', mats.ghost);
  scene.add(body.root);
  const camera = new THREE.PerspectiveCamera(28, W / H, 0.05, 50);
  thumbCtx = { renderer, scene, body, camera };
  return thumbCtx;
}

export async function renderPoseThumbnail(moveId, scores, cacheKey = moveId) {
  if (thumbCache.has(cacheKey)) return thumbCache.get(cacheKey);
  const { renderer, scene, body, camera } = await getThumbCtx();
  const P = normalize(MOVES[moveId].pose(scores));
  P['travel.x'] = P['travel.z'] = 0;
  applyPose(body, P);
  settle(body, 0, P);
  // Frame the whole skeleton from a three-quarter view.
  const box = new THREE.Box3();
  for (const c of body.contacts) box.expandByPoint(c.getWorldPosition(new THREE.Vector3()));
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const fit = Math.max(size.y, Math.max(size.x, size.z) / camera.aspect) * 0.62;
  const dist = fit / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dir = new THREE.Vector3(Math.sin(0.55), 0.28, Math.cos(0.55)).normalize();
  camera.position.copy(centre).addScaledVector(dir, dist);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  thumbCache.set(cacheKey, url);
  return url;
}
