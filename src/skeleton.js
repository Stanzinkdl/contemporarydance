import * as THREE from 'three';
import SKELETON from './data/skeleton.json';

// Anatomical bone meshes from BodyParts3D (CC BY 4.0), prepared by
// tools/build-skeleton.mjs. Joints, segments and contact points are bundled
// (src/data/skeleton.json); the mesh data is fetched once (public/skeleton/bones.bin)
// and shared by every figure on the page.

export { SKELETON };

let pending = null;
export function loadBoneGeometries() {
  pending ??= fetch(`${import.meta.env.BASE_URL}skeleton/bones.bin`)
    .then((r) => {
      if (!r.ok) throw new Error(`bones.bin: ${r.status}`);
      return r.arrayBuffer();
    })
    .then(decode);
  return pending;
}

function decode(buf) {
  const out = {};
  for (const e of SKELETON.entries) {
    const q = new Int16Array(buf, e.posOffset, e.vertices * 3);
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) {
      const k = i % 3;
      pos[i] = e.min[k] + ((q[i] + 32768) / 65535) * e.scale[k];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, e.idxOffset, e.indices).slice(), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    (out[e.seg] ??= []).push({ mat: e.mat, geometry: g });
  }
  return out;
}

// Joint position helpers (metres, rest pose, floor at y = 0).
export const joint = (name) => new THREE.Vector3(...SKELETON.joints[name]);
export const offset = (to, from) => joint(to).sub(joint(from));
