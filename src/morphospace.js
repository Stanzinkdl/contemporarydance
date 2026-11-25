import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 3D "dance morphospace": every technique placed by its first three principal
// components, with arrows showing which original axis pulls in which direction.

const SCALE = 2.4;

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function createMorphospace(container, { techniques, axes, pcaResult, simMatrix, onSelect }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'ms-labels';
  container.appendChild(labelLayer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(4.1, 2.7, 5.7);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = 2;
  controls.maxDistance = 12;
  // Let the page scroll on touch devices unless the user drags with two fingers.
  controls.enableZoom = true;
  renderer.domElement.addEventListener('pointerdown', () => (controls.autoRotate = false));

  scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(3, 5, 2);
  scene.add(dl);

  const lineColor = cssVar('--line', '#666');
  const accent = cssVar('--accent', '#e0603a');

  // Bounding cube: the full space of possible techniques. Most of it is empty.
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(SCALE * 2, SCALE * 2, SCALE * 2)),
    new THREE.LineBasicMaterial({ color: lineColor, transparent: true, opacity: 0.35 })
  );
  scene.add(box);

  // Normalise PCA coordinates into the cube.
  const pts = pcaResult.points;
  const maxAbs = Math.max(...pts.flat().map(Math.abs)) || 1;
  const toWorld = (p) => new THREE.Vector3(p[0], p[1], p[2] ?? 0).multiplyScalar(SCALE / maxAbs * 0.92);

  // Similarity edges between close pairs.
  const edgePositions = [];
  const edgeColors = [];
  const base = new THREE.Color(lineColor);
  const hot = new THREE.Color(accent);
  for (let i = 0; i < techniques.length; i++) {
    for (let j = i + 1; j < techniques.length; j++) {
      const s = simMatrix[i][j];
      if (s < 0.78) continue;
      const a = toWorld(pts[i]);
      const b = toWorld(pts[j]);
      edgePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const c = base.clone().lerp(hot, (s - 0.78) / 0.22);
      edgeColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
  }
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  edgeGeo.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));
  scene.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 })));

  // Technique nodes.
  const nodes = techniques.map((t, i) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 24, 16),
      new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.4, emissive: t.color, emissiveIntensity: 0.15 })
    );
    mesh.position.copy(toWorld(pts[i]));
    mesh.userData.id = t.id;
    scene.add(mesh);
    const label = document.createElement('button');
    label.className = 'ms-label';
    label.textContent = t.name;
    label.style.setProperty('--c', t.color);
    label.addEventListener('click', () => onSelect?.(t.id));
    labelLayer.appendChild(label);
    return { t, mesh, label };
  });

  // Axis loadings (biplot arrows): direction each original axis points in this space.
  const loadingEls = axes.map((ax, k) => {
    const dir = new THREE.Vector3(
      pcaResult.components[0][k],
      pcaResult.components[1][k],
      pcaResult.components[2]?.[k] ?? 0
    );
    const len = dir.length();
    const arrow = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(), len * SCALE * 1.1, lineColor, 0.08, 0.05);
    arrow.line.material.transparent = true;
    arrow.line.material.opacity = 0.6;
    scene.add(arrow);
    const tip = dir.clone().normalize().multiplyScalar(len * SCALE * 1.18);
    const el = document.createElement('span');
    el.className = 'ms-axis';
    el.textContent = `${ax.label} → ${ax.high}`;
    labelLayer.appendChild(el);
    return { el, pos: tip };
  });

  // A marker for the reader's own technique from the explorer.
  const you = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6, wireframe: true })
  );
  you.visible = false;
  scene.add(you);
  const youLabel = document.createElement('span');
  youLabel.className = 'ms-axis ms-you';
  youLabel.textContent = 'your technique';
  youLabel.hidden = true;
  labelLayer.appendChild(youLabel);

  // Picking.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(nodes.map((n) => n.mesh))[0];
    if (hit) onSelect?.(hit.object.userData.id);
  });

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

  const v = new THREE.Vector3();
  function place(el, pos, w, h) {
    v.copy(pos).project(camera);
    const behind = v.z > 1;
    el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
    el.style.opacity = behind ? 0 : 1;
  }

  let selectedId = null;
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    controls.update();
    renderer.render(scene, camera);
    const w = container.clientWidth;
    const h = container.clientHeight;
    nodes.forEach((n) => {
      place(n.label, n.mesh.position, w, h);
      const sel = n.t.id === selectedId;
      n.label.classList.toggle('is-selected', sel);
      n.mesh.scale.setScalar(sel ? 1.8 : 1);
    });
    loadingEls.forEach((l) => place(l.el, l.pos, w, h));
    if (you.visible) {
      you.rotation.y += 0.02;
      place(youLabel, you.position, w, h);
    }
  }
  frame();

  return {
    select(id) {
      selectedId = id;
    },
    showCustom(vec) {
      you.position.copy(toWorld(pcaResult.project(vec)));
      you.visible = true;
      youLabel.hidden = false;
    },
  };
}
