import * as THREE from 'three';
import { SKELETON, loadBoneGeometries, joint, offset } from './skeleton.js';
import { MOVES, PHRASES, normalize, mirrorPose, lerpPose } from './phrases.js';

// The dancer: an anatomical skeleton (BodyParts3D) on a rig whose joints are
// measured from those bones, dancing technique-specific phrases.
//
// Every step blends from wherever the body currently is, and each phrase
// starts and ends on the same home pose, so the loop never jumps.

// ?cam=side shows the dancer in profile (handy for checking poses).
const SIDE_VIEW = new URLSearchParams(location.search).get('cam') === 'side';

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
    this.current = { ...this.from };
  }

  arrange(def, p) {
    const steps = (this.role === 'partner' && def.partner) || def.steps;
    const mid = steps.map((s) => [...s]);
    // Improvised techniques reshuffle their material each time round;
    // duets keep a fixed order so both partners stay together.
    if (!def.duet && p.structure < 0.5) {
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

  targetFor(name, p) {
    let pose = normalize(MOVES[name].pose(p));
    // Solo phrases alternate sides each time round; a partner dances the mirror image.
    const flipLoop = !this.duet && this.loop % 2 === 1;
    if (flipLoop !== this.mirror) pose = mirrorPose(pose);
    return pose;
  }

  update(p, dt, phraseId, reduceMotion) {
    const def = PHRASES[phraseId] || PHRASES.intro;
    const sig = `${phraseId}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.duet = !!def.duet;
      this.loop = 0;
      this.arrange(def, p);
      this.from = { ...this.current };
      this.idx = 1;
      this.t = this.duet ? 0 : this.startOffset;
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
    const k = ease(Math.min(1, this.t / dur), p.dynamics);
    this.current = lerpPose(this.from, this.targetFor(name, p), k);

    if (this.t >= dur + hold) {
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
  const limb = (parent, to, r1, r2) => {
    const len = to.length();
    const geo = new THREE.CylinderGeometry(r2, r1, len, 24, 1);
    geo.translate(0, len / 2, 0);
    const mesh = new THREE.Mesh(geo, mats.flesh);
    mesh.quaternion.setFromUnitVectors(UP, to.clone().normalize());
    fleshMesh(parent, mesh);
    ellipsoid(parent, new THREE.Vector3(), [r1, r1, r1], mats.fleshJoint);
  };

  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // pitch/roll in the body's frame, then facing

  const pelvis = group(root, joint('midHip'));
  const s1 = group(pelvis, offset('lumbosacral', 'midHip'));
  const s2 = group(s1, offset('thoracolumbar', 'lumbosacral'));
  const neck = group(s2, offset('cervicothoracic', 'thoracolumbar'));
  const head = group(neck, offset('atlanto', 'cervicothoracic'));

  ellipsoid(pelvis, new THREE.Vector3(0, 0.04, -0.01), [0.165, 0.11, 0.115]);
  ellipsoid(s1, new THREE.Vector3(0, 0.08, 0.02), [0.13, 0.12, 0.1]);
  ellipsoid(s2, new THREE.Vector3(0, 0.15, 0.015), [0.165, 0.185, 0.115]);
  limb(neck, offset('atlanto', 'cervicothoracic'), 0.05, 0.045);
  ellipsoid(head, new THREE.Vector3(0, 0.085, 0.025), [0.082, 0.112, 0.1]);
  ellipsoid(head, new THREE.Vector3(0, 0.075, 0.125), [0.016, 0.024, 0.018], mats.fleshJoint); // nose

  const segs = { pelvis, lumbar: s1, thorax: s2, neck, head };

  const arms = [['L', 1], ['R', -1]].map(([S, s]) => {
    const shoulder = group(s2, offset(`shoulder${S}`, 'thoracolumbar'));
    const upper = group(shoulder);
    const fore = group(upper, offset(`elbow${S}`, `shoulder${S}`));
    const wrist = group(fore, offset(`wrist${S}`, `elbow${S}`));
    limb(upper, offset(`elbow${S}`, `shoulder${S}`), 0.048, 0.037);
    limb(fore, offset(`wrist${S}`, `elbow${S}`), 0.037, 0.026);
    const handAxis = offset(`handTip${S}`, `wrist${S}`);
    const hand = ellipsoid(wrist, handAxis.clone().multiplyScalar(0.75), [0.028, 0.08, 0.045]);
    hand.quaternion.setFromUnitVectors(UP, handAxis.clone().normalize());
    const tip = new THREE.Object3D();
    tip.position.copy(handAxis.clone().multiplyScalar(1.9)); // fingertips
    wrist.add(tip);
    Object.assign(segs, { [`upperArm${S}`]: upper, [`foreArm${S}`]: fore, [`hand${S}`]: wrist });
    return { S, s, upper, fore, wrist, tip };
  });

  const legs = [['L', 1], ['R', -1]].map(([S, s]) => {
    const hip = group(pelvis, offset(`hip${S}`, 'midHip'));
    const thigh = group(hip);
    const shin = group(thigh, offset(`knee${S}`, `hip${S}`));
    const foot = group(shin, offset(`ankle${S}`, `knee${S}`));
    limb(thigh, offset(`knee${S}`, `hip${S}`), 0.075, 0.05);
    limb(shin, offset(`ankle${S}`, `knee${S}`), 0.052, 0.034);
    const footAxis = offset(`toe${S}`, `ankle${S}`);
    const f = ellipsoid(foot, new THREE.Vector3(footAxis.x * 0.4, -0.03, 0.05), [0.042, 0.032, 0.125]);
    f.rotation.y = Math.atan2(footAxis.x, footAxis.z);
    Object.assign(segs, { [`thigh${S}`]: thigh, [`shin${S}`]: shin, [`foot${S}`]: foot });
    return { S, s, thigh, shin, foot };
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

  return { root, pelvis, s1, s2, neck, head, arms, legs, contacts, flesh, bones: [], segs };
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

function applyPose(body, P) {
  body.root.rotation.set(P['root.x'], P['root.y'], P['root.z']);
  body.pelvis.rotation.set(P['pelvis.x'], P['pelvis.y'], P['pelvis.z']);
  body.pelvis.position.x = joint('midHip').x + P['pelvis.shift'];
  body.s1.rotation.set(P['s1.x'], P['s1.y'], P['s1.z']);
  body.s2.rotation.set(P['s2.x'], P['s2.y'], P['s2.z']);
  body.neck.rotation.set(P['neck.x'], P['neck.y'], P['neck.z']);
  body.head.rotation.set(P['head.x'], P['head.y'], P['head.z']);
  body.arms.forEach(({ S, s, upper, fore, wrist }) => {
    const g = `arm${S}`;
    upper.rotation.set(-P[`${g}.f`], s * P[`${g}.t`], s * P[`${g}.a`]);
    fore.rotation.set(-P[`${g}.e`], 0, 0);
    wrist.rotation.set(-P[`${g}.w`], 0, 0);
  });
  body.legs.forEach(({ S, s, thigh, shin, foot }) => {
    const g = `leg${S}`;
    const f = P[`${g}.f`];
    const k = P[`${g}.k`];
    // Turnout rotates the leg outward around its own length.
    thigh.rotation.set(-f, s * P[`${g}.t`], s * P[`${g}.a`], 'XZY');
    shin.rotation.set(k, 0, 0);
    // Keep the sole level with the floor, plus any point of the foot.
    foot.rotation.set(P[`${g}.p`] - (P['root.x'] + P['pelvis.x'] - f + k), 0, 0);
  });
}

// Put the lowest point of the skeleton on the floor, keep the dancer centred
// over its feet, then add any travelling step.
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
  body.root.position.set(baseX - cx + P['travel.x'], -minY, -cz + P['travel.z']);
  body.root.updateMatrixWorld(true);
}

// Gentle, always-on life: breathing, slight sway, wandering in improvised
// techniques, and Gaga-style shaking when a step asks for it.
function addLife(P, p, time, phase) {
  const out = { ...P };
  out['s2.x'] += Math.sin(time * 1.3 + phase) * 0.02;
  out['head.x'] += Math.sin(time * 1.3 + phase + 0.6) * 0.012;
  out['root.z'] += Math.sin(time * 0.6 + phase) * 0.008;
  const free = 1 - p.structure;
  out['armL.a'] += Math.sin(time * 0.9 + phase) * 0.12 * free;
  out['armR.a'] += Math.sin(time * 0.77 + phase + 2) * 0.12 * free;
  out['s1.y'] += Math.sin(time * 0.5 + phase + 1) * 0.08 * free;
  if (P.shake > 0.01) {
    const q = P.shake * 0.05;
    ['s1.x', 's2.z', 'neck.y', 'head.x', 'armL.a', 'armR.a', 'armL.e', 'armR.e', 'legL.k', 'legR.k'].forEach((k, i) => {
      out[k] += Math.sin(time * (27 + i * 3.1) + i) * q;
    });
  }
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
  const lookAt = new THREE.Vector3(0, 0.9, 0);

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

    // Slow, subtle camera drift gives depth without distracting.
    const ang = SIDE_VIEW ? Math.PI / 2 : 0.18 + Math.sin(time * 0.12) * 0.12;
    camera.position.set(Math.sin(ang) * wide, 1.35, Math.cos(ang) * wide);
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
    // params: the eight scores; phrase: which technique's phrase to dance.
    setTarget(params, phrase) {
      target = { ...target, ...params };
      if (phrase) phraseId = phrase;
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
