import * as THREE from 'three';
import { SKELETON, loadBoneGeometries, joint, offset } from './skeleton.js';
import { buildBody, attachBones, setBodyStyle, makeMats, cssVar } from './figure.js';

// Plays CMU motion-capture recordings of real dancers on the same anatomical
// skeleton. Only the recorded *rotations* are used; bone lengths stay those of
// the anatomical model, so the skeleton never stretches.
//
// CMU ASF/AMC conventions (Acclaim): each bone has a rest direction, a local
// frame C (from "axis", Euler XYZ in degrees) and per-frame rotations M.
// Its global rotation relative to the rest pose is G = G_parent · C · M · C⁻¹.

// Our segment → the CMU bone whose rotation drives it.
const DRIVER = {
  pelvis: 'root', lumbar: 'lowerback', thorax: 'thorax', neck: 'lowerneck', head: 'head',
  upperArmL: 'lhumerus', foreArmL: 'lradius', handL: 'lhand',
  upperArmR: 'rhumerus', foreArmR: 'rradius', handR: 'rhand',
  thighL: 'lfemur', shinL: 'ltibia', footL: 'lfoot',
  thighR: 'rfemur', shinR: 'rtibia', footR: 'rfoot',
};
// Our segment hierarchy (parent segment).
const PARENT = {
  pelvis: null, lumbar: 'pelvis', thorax: 'lumbar', neck: 'thorax', head: 'neck',
  upperArmL: 'thorax', foreArmL: 'upperArmL', handL: 'foreArmL',
  upperArmR: 'thorax', foreArmR: 'upperArmR', handR: 'foreArmR',
  thighL: 'pelvis', shinL: 'thighL', footL: 'shinL',
  thighR: 'pelvis', shinR: 'thighR', footR: 'shinR',
};
const ORDER = Object.keys(PARENT);
const D2R = Math.PI / 180;

function eulerQ(x, y, z) {
  // Acclaim "XYZ" = rotate about X, then Y, then Z (fixed axes) = Rz·Ry·Rx.
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D2R, y * D2R, z * D2R, 'ZYX'));
}

// Precompute, for every frame, each segment's world rotation and the root position.
function solveClip(clip) {
  const bones = clip.bones.map((b) => ({ ...b, C: eulerQ(...b.axis), Cinv: eulerQ(...b.axis).invert() }));
  const byName = new Map(bones.map((b, i) => [b.name, i]));
  const order = []; // parents before children
  const visit = (name) => {
    const b = bones[byName.get(name)];
    if (order.includes(b)) return;
    if (b.parent) visit(b.parent);
    order.push(b);
  };
  bones.forEach((b) => visit(b.name));

  // Align our rest-pose segments with the CMU rest directions.
  const align = {};
  for (const seg of ORDER) {
    const b = bones[byName.get(DRIVER[seg])];
    const ours = new THREE.Vector3(...SKELETON.segments[seg].axis).normalize();
    const theirs = new THREE.Vector3(...b.dir);
    align[seg] = seg === 'pelvis' || theirs.lengthSq() === 0 ? new THREE.Quaternion() : new THREE.Quaternion().setFromUnitVectors(ours, theirs.normalize());
  }

  // Scale the recorded root path to our skeleton's leg length.
  const legOurs = joint('hipL').distanceTo(joint('ankleL'));
  const legTheirs = bones[byName.get('lfemur')].len + bones[byName.get('ltibia')].len;
  const k = legOurs / legTheirs;

  const frames = clip.frames.map((vals) => {
    const G = {};
    let i = 0;
    let rootPos = null;
    // Values are stored in bone order with each bone's dof list.
    const dofVals = new Map();
    for (const b of bones) {
      const v = {};
      for (const d of b.dof) v[d] = vals[i++];
      dofVals.set(b.name, v);
    }
    for (const b of order) {
      const v = dofVals.get(b.name);
      const M = eulerQ(v.rx || 0, v.ry || 0, v.rz || 0);
      const local = b.C.clone().multiply(M).multiply(b.Cinv);
      G[b.name] = b.parent ? G[b.parent].clone().multiply(local) : local;
      if (!b.parent) rootPos = new THREE.Vector3(v.tx, v.ty, v.tz).multiplyScalar(k);
    }
    const world = {};
    for (const seg of ORDER) world[seg] = G[DRIVER[seg]].clone().multiply(align[seg]);
    return { world, rootPos };
  });
  return frames;
}

// Pose the rig from world rotations: each joint's local rotation is
// parent⁻¹ · own; the pelvis is placed so the lumbosacral joint follows the
// recorded root.
const restLumbo = offset('lumbosacral', 'midHip');
function poseFromFrame(body, f, base) {
  const q = new THREE.Quaternion();
  for (const seg of ORDER) {
    const g = body.segs[seg];
    const parent = PARENT[seg];
    q.copy(f.world[seg]);
    if (parent) q.premultiply(f.world[parent].clone().invert());
    g.quaternion.copy(q);
  }
  // Pelvis world position = root path − rotated (lumbosacral − midHip).
  const pelvisPos = f.rootPos.clone().sub(base).sub(restLumbo.clone().applyQuaternion(f.world.pelvis));
  body.root.position.copy(pelvisPos).sub(joint('midHip')); // floor offset is applied by the caller
}

export function createMocapScene(container, { style: initialStyle = 'skeleton', onClip } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-3, 2.5, -2.5);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(6, 12, cssVar('--line', '#666'), cssVar('--line', '#666'));
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  const mats = makeMats(cssVar('--figure', '#e8dcc8'), cssVar('--bone', '#e6dcc6'), false);
  const body = buildBody(mats);
  // The rig's own rest rotations are replaced wholesale by quaternions.
  body.root.rotation.set(0, 0, 0);
  scene.add(body.root);
  let style = initialStyle;
  setBodyStyle(body, style, mats.ghost);
  loadBoneGeometries().then((geos) => {
    attachBones(body, geos, mats);
    setBodyStyle(body, style, mats.ghost);
  });

  let frames = null;
  let base = new THREE.Vector3();
  let floorY = 0;
  let fps = 30;
  let t = 0;
  let playing = true;
  let speed = 1;

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();
  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(container);

  const tmp = new THREE.Vector3();
  function lowestPoint() {
    body.root.updateMatrixWorld(true);
    let m = Infinity;
    for (const c of body.contacts) {
      c.getWorldPosition(tmp);
      m = Math.min(m, tmp.y);
    }
    return m;
  }

  async function load(id) {
    const clip = await fetch(`${import.meta.env.BASE_URL}mocap/${id}.json`).then((r) => r.json());
    fps = clip.fps;
    frames = solveClip(clip);
    base = frames[0].rootPos.clone().setY(0); // start at the centre of the floor
    // Find the clip's lowest point so the feet meet the floor (jumps stay jumps).
    floorY = Infinity;
    for (let i = 0; i < frames.length; i += 2) {
      poseFromFrame(body, frames[i], base);
      floorY = Math.min(floorY, lowestPoint());
    }
    t = 0;
    onClip?.(clip);
  }

  const clock = new THREE.Clock();
  const look = new THREE.Vector3();
  const camPos = new THREE.Vector3(2.2, 1.6, 5.2);
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || !frames) return;
    if (playing) t += dt * speed;
    const n = frames.length;
    const pos = (t * fps) % n;
    const i0 = Math.floor(pos);
    const i1 = (i0 + 1) % n;
    const a = pos - i0;
    // Interpolate between captured frames for smooth slow motion.
    const f0 = frames[i0];
    const f1 = frames[i1];
    const f = {
      rootPos: f0.rootPos.clone().lerp(f1.rootPos, i1 === 0 ? 0 : a),
      world: Object.fromEntries(ORDER.map((s) => [s, f0.world[s].clone().slerp(f1.world[s], a)])),
    };
    poseFromFrame(body, f, base);
    body.root.position.y -= floorY;

    // Camera follows the dancer gently.
    body.pelvis.getWorldPosition(tmp);
    look.lerp(tmp.setY(0.9), 0.08);
    camera.position.lerp(new THREE.Vector3(look.x + 2.2, 1.6, look.z + 5.2), 0.05);
    camera.lookAt(look);
    renderer.render(scene, camera);
  }
  frame();
  camera.position.copy(camPos);

  return {
    load,
    setPlaying(v) {
      playing = v;
    },
    isPlaying: () => playing,
    setSpeed(v) {
      speed = v;
    },
    setStyle(s) {
      style = s;
      setBodyStyle(body, s, mats.ghost);
    },
    progress: () => (frames ? ((t * fps) % frames.length) / frames.length : 0),
  };
}
