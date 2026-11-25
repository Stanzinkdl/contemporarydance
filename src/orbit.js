import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Free 3D camera around a dancer: drag to orbit in any direction, right-drag
// (or two fingers) to pan, Ctrl/⌘ + scroll or pinch to zoom, plus buttons for
// Front / Side / Back / Above. Until the viewer touches it, the camera drifts
// gently; "⟲" returns to that drift. The camera follows the dancer as it travels.
//
// Plain scrolling is left to the page so the essay never gets stuck.

const VIEWS = {
  front: [0.18, 1.32],
  side: [Math.PI / 2, 1.38],
  back: [Math.PI, 1.38],
  above: [0.35, 0.22],
}; // [azimuth, polar angle]

export function createOrbit({ camera, renderer, container, height = 0.9, scrollFriendly = false, initialView = null }) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false; // handled below so plain scrolling still scrolls the page
  controls.minDistance = 1.2;
  controls.maxDistance = 14;
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI - 0.02; // allow looking from below the floor too
  controls.target.set(0, height, 0);
  if (scrollFriendly) {
    // On touch screens one finger keeps scrolling the page; two fingers orbit and zoom.
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    renderer.domElement.style.touchAction = 'pan-y';
  } else {
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }

  let user = false;
  let anim = null; // camera offset we are easing towards
  controls.addEventListener('start', () => {
    user = true;
    anim = null;
  });

  function zoom(factor) {
    const off = camera.position.clone().sub(controls.target);
    const d = THREE.MathUtils.clamp(off.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(off.setLength(d));
  }
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return; // trackpad pinch arrives as ctrl + wheel
      e.preventDefault();
      user = true;
      anim = null;
      zoom(Math.exp(e.deltaY * 0.01));
    },
    { passive: false }
  );

  function setView(name) {
    if (name === 'reset') {
      user = false;
      anim = null;
      return;
    }
    const [az, pol] = VIEWS[name];
    const d = camera.position.distanceTo(controls.target);
    anim = new THREE.Vector3().setFromSphericalCoords(d, pol, az);
    user = true;
  }

  const ui = document.createElement('div');
  ui.className = 'view-ctrls';
  ui.innerHTML = `
    <button data-v="front">Front</button><button data-v="side">Side</button><button data-v="back">Back</button><button data-v="above">Above</button>
    <button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button><button data-v="reset" aria-label="Reset view" title="Reset view">⟲</button>`;
  ui.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.z) {
      user = true;
      anim = null;
      zoom(b.dataset.z === 'in' ? 0.8 : 1.25);
    } else setView(b.dataset.v);
  });
  container.appendChild(ui);
  const hint = document.createElement('p');
  hint.className = 'view-hint';
  hint.textContent = scrollFriendly
    ? 'Drag to turn around the dancer · Ctrl/⌘ + scroll or pinch to zoom · two fingers on touch'
    : 'Drag to turn around the dancer · right-drag to pan · Ctrl/⌘ + scroll or pinch to zoom';
  container.appendChild(hint);

  const want = new THREE.Vector3();
  function update({ follow, time, distance }) {
    if (follow) {
      want.set(follow.x, height, follow.z).sub(controls.target).multiplyScalar(0.06);
      controls.target.add(want);
      camera.position.add(want);
    }
    if (!user) {
      const ang = 0.18 + Math.sin(time * 0.12) * 0.12;
      camera.position.set(controls.target.x + Math.sin(ang) * distance, 1.35, controls.target.z + Math.cos(ang) * distance);
    } else if (anim) {
      want.copy(controls.target).add(anim);
      camera.position.lerp(want, 0.12);
      if (camera.position.distanceTo(want) < 0.005) anim = null;
    }
    controls.update();
  }

  if (initialView) {
    camera.position.set(0, 1.35, 5.6);
    setView(initialView);
  }
  return { controls, update, setView, isUser: () => user };
}
