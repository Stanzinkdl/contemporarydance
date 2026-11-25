import * as THREE from 'three';

// A procedural dancer: a jointed figure whose pose and motion come entirely
// from the 8 technique scores. Nothing is keyframed — change the numbers and
// the movement changes, the same way Raup's three numbers grow a shell.

const AXES = ['grounding', 'torso', 'dynamics', 'floor', 'initiation', 'structure', 'fall', 'contact'];

const L = {
  leg: 0.46, // thigh and shin are equal length, which keeps the plié math simple
  hipW: 0.1,
  spineSeg: 0.17,
  neck: 0.08,
  head: 0.11,
  shoulderW: 0.19,
  upperArm: 0.29,
  forearm: 0.27,
  foot: 0.04,
};

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function limb(length, radius, material) {
  // Capsule hangs downward from its joint (the group origin).
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 6, 12);
  geo.translate(0, -length / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function segment(length, radius, material) {
  // Capsule rising upward from its joint.
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 6, 12);
  geo.translate(0, length / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function buildBody(material) {
  const root = new THREE.Group(); // sits on the floor, pivot for falling
  const pelvis = new THREE.Group();
  root.add(pelvis);

  const pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), material);
  pelvisMesh.scale.set(1.3, 0.8, 0.9);
  pelvisMesh.castShadow = true;
  pelvis.add(pelvisMesh);

  // Spine: three chained segments so contraction becomes a curve, not a hinge.
  const spine = [];
  let parent = pelvis;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.position.y = i === 0 ? 0.04 : L.spineSeg;
    g.add(segment(L.spineSeg, 0.085 + (i === 2 ? 0.02 : 0), material));
    parent.add(g);
    spine.push(g);
    parent = g;
  }
  const chest = spine[2];

  const neck = new THREE.Group();
  neck.position.y = L.spineSeg;
  neck.add(segment(L.neck, 0.035, material));
  chest.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(L.head, 20, 16), material);
  head.scale.set(0.85, 1.05, 0.95);
  head.position.y = L.neck + L.head * 0.8;
  head.castShadow = true;
  neck.add(head);

  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * L.shoulderW, L.spineSeg * 0.85, 0);
    chest.add(shoulder);
    const upper = new THREE.Group();
    upper.add(limb(L.upperArm, 0.04, material));
    shoulder.add(upper);
    const fore = new THREE.Group();
    fore.position.y = -L.upperArm;
    fore.add(limb(L.forearm, 0.033, material));
    upper.add(fore);
    const hand = new THREE.Object3D();
    hand.position.y = -L.forearm;
    fore.add(hand);
    return { side, upper, fore, hand };
  });

  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * L.hipW, 0, 0);
    pelvis.add(hip);
    const thigh = new THREE.Group();
    thigh.add(limb(L.leg, 0.06, material));
    hip.add(thigh);
    const shin = new THREE.Group();
    shin.position.y = -L.leg;
    shin.add(limb(L.leg, 0.045, material));
    thigh.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.2), material);
    foot.position.set(0, -L.leg, 0.06);
    foot.castShadow = true;
    shin.add(foot);
    return { side, thigh, shin, foot };
  });

  return { root, pelvis, spine, neck, arms, legs };
}

// Waveform with adjustable "attack": k≈0 → smooth sine (sustained),
// large k → square-ish pulses with sharp changes and holds (percussive).
function wave(phase, dyn) {
  const k = 0.6 + dyn * 7;
  return Math.tanh(k * Math.sin(phase)) / Math.tanh(k);
}

// Deterministic wandering signal used to break up the rhythm when a
// technique is improvised rather than codified.
function drift(t) {
  return (Math.sin(t * 1.31) + Math.sin(t * 2.17 + 1.3) + Math.sin(t * 0.71 + 2.1)) / 3;
}

function poseBody(body, p, t, { lean = 0, mirror = 1 } = {}) {
  const speed = 0.5 + p.dynamics * 2.6; // radians per second
  const jitter = (1 - p.structure) * 1.6 * drift(t * 0.6 + (mirror > 0 ? 0 : 3.3));
  const ph = t * speed + jitter;
  const w = wave(ph, p.dynamics); // main pulse, -1..1
  const w2 = wave(ph * 0.5 + 0.8, p.dynamics * 0.6); // slower secondary pulse
  const ampVar = 0.75 + 0.25 * (1 - p.structure) * drift(t * 0.9 + 5);

  // ---- Legs: plié depth from weight + floor ----
  const depth = 0.08 + p.grounding * 0.45 + p.floor * 0.6; // radians of thigh flexion
  const bounce = 0.08 * p.grounding * (0.5 + 0.5 * w);
  const a = Math.min(1.35, depth + bounce);
  const spread = 0.06 + p.grounding * 0.16;
  body.legs.forEach((leg) => {
    leg.thigh.rotation.set(-a, 0, leg.side * spread);
    leg.shin.rotation.set(2 * a, 0, 0);
    leg.foot.rotation.set(-a, 0, 0);
  });
  const hipHeight = 2 * L.leg * Math.cos(a) * Math.cos(spread) + L.foot;
  body.pelvis.position.y = hipHeight;

  // ---- Pelvis: centre-initiated techniques pulse from the pelvis ----
  const centre = p.initiation;
  body.pelvis.rotation.x = centre * 0.22 * w * ampVar;
  body.pelvis.rotation.y = centre * p.torso * 0.25 * w2;

  // ---- Spine: contraction (curve), spiral (twist), and forward fold for floor work ----
  const contraction = p.torso * 0.32 * (0.35 + 0.65 * Math.max(0, w)) * ampVar;
  const spiral = p.torso * 0.28 * w2;
  const fold = p.floor * 0.28;
  body.spine.forEach((seg, i) => {
    const delay = centre * i * 0.35; // successional: centre starts, chest follows
    const wd = wave(ph - delay, p.dynamics);
    seg.rotation.x = fold + contraction * (0.6 + 0.4 * wd);
    seg.rotation.y = spiral;
    seg.rotation.z = p.torso * 0.06 * Math.sin(ph * 0.5 + i);
  });
  body.neck.rotation.x = -fold * 0.6 + p.torso * 0.15 * w;

  // ---- Arms: peripheral techniques lead with big arm paths ----
  const periph = 1 - p.initiation;
  body.arms.forEach((arm) => {
    const s = arm.side * mirror;
    const lift = 0.18 + periph * 1.7 * (0.5 + 0.5 * wave(ph + s * 0.9, p.dynamics)) + p.floor * 0.3;
    const swing = (0.15 + periph * 0.6) * wave(ph * 0.5 + s, p.dynamics * 0.7);
    arm.upper.rotation.set(-swing - p.floor * 0.7, 0, arm.side * lift * ampVar);
    arm.fore.rotation.set(-0.25 - centre * 0.35 * Math.max(0, w), 0, arm.side * 0.15 * periph);
  });

  // ---- Balance: fall-and-recovery tips the whole body off its base ----
  const fallSway = p.fall * 0.38 * wave(ph * 0.5, p.dynamics * 0.5);
  body.root.rotation.z = fallSway * mirror - lean;
  body.root.rotation.x = p.fall * 0.12 * w2;
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createFigureScene(container, { trail = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0.6, 1.25, 4.4);
  camera.lookAt(0, 0.85, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  const mainMat = new THREE.MeshStandardMaterial({ color: cssVar('--figure', '#e8dcc8'), roughness: 0.55, metalness: 0.05 });
  const partnerMat = new THREE.MeshStandardMaterial({ color: cssVar('--accent', '#e0603a'), roughness: 0.6, transparent: true, opacity: 0 });

  const dancer = buildBody(mainMat);
  const partner = buildBody(partnerMat);
  scene.add(dancer.root, partner.root);

  // Floor: a thin ring and a soft shadow, rather than a full plane.
  const floor = new THREE.Group();
  const ringMat = new THREE.LineBasicMaterial({ color: cssVar('--line', '#555'), transparent: true, opacity: 0.6 });
  const ringPts = [];
  for (let i = 0; i <= 96; i++) {
    const th = (i / 96) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(th) * 1.3, 0, Math.sin(th) * 1.3));
  }
  floor.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat));
  const shadowTex = makeShadowTexture();
  const shadows = [dancer, partner].map(() => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002;
    floor.add(m);
    return m;
  });
  scene.add(floor);

  // Motion trace of one hand: makes dynamics visible (smooth arcs vs jagged stops).
  const TRAIL_N = 90;
  const trailPos = new Float32Array(TRAIL_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trailLine = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: cssVar('--accent', '#e0603a'), transparent: true, opacity: 0.8 })
  );
  trailLine.frustumCulled = false;
  trailLine.visible = trail;
  scene.add(trailLine);
  let trailFilled = false;

  const current = Object.fromEntries(AXES.map((k) => [k, 0.5]));
  let target = { ...current };

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Pull back on narrow screens so the duet still fits.
    camera.position.z = width / height < 0.8 ? 6.2 : 4.4;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(container);

  const handWorld = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = reduceMotion ? 1.2 : clock.elapsedTime;
    const ease = 1 - Math.exp(-dt * 4);
    AXES.forEach((k) => (current[k] += (target[k] - current[k]) * ease));

    // The partner only appears for genuinely partnered work; low contact
    // values (occasional touch) shouldn't read as a duet.
    const cRaw = Math.min(1, Math.max(0, (current.contact - 0.3) / 0.5));
    const c = cRaw * cRaw * (3 - 2 * cRaw);
    const lean = c * 0.28;
    dancer.root.position.x = -c * 0.68;
    partner.root.position.x = c * 0.68;
    poseBody(dancer, current, t, { lean });
    poseBody(partner, current, t + 0.4, { lean: -lean, mirror: -1 });
    partner.root.visible = c > 0.02;
    partnerMat.opacity = Math.min(1, c * 1.4);

    shadows[0].position.x = dancer.root.position.x;
    shadows[1].position.x = partner.root.position.x;
    shadows[1].material.opacity = partnerMat.opacity;
    const shadowSize = 0.8 + current.floor * 0.5;
    shadows.forEach((s) => s.scale.set(shadowSize, shadowSize, 1));

    if (trail) {
      dancer.root.updateMatrixWorld(true);
      dancer.arms[1].hand.getWorldPosition(handWorld);
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
    snap(params) {
      Object.assign(current, params);
      target = { ...current };
    },
  };
}
