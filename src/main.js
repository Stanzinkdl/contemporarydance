import './style.css';
import data from './data/techniques.json';
import { toVector, similarityMatrix, pca, nearest, compareAxes } from './similarity.js';
import { createFigureScene } from './figure.js';
import { createMorphospace } from './morphospace.js';
import { drawHeatmap, drawLineage } from './charts.js';

// ---------- Data prep ----------
const PALETTE = ['#e0603a', '#e8a33d', '#c9c04a', '#7fb069', '#3fa7a0', '#4a90c9', '#7b6fd6', '#b65fc4', '#d4588f', '#a37b5c', '#8fa3b0', '#d98c6c'];
const axes = data.axes;
const techniques = data.techniques.map((t, i) => ({ ...t, color: PALETTE[i % PALETTE.length], vec: toVector(t.scores, axes) }));
const byId = new Map(techniques.map((t) => [t.id, t]));
const vectors = techniques.map((t) => t.vec);
const simMatrix = similarityMatrix(vectors);
const pcaResult = pca(vectors, 3);
const pcOrder = techniques.map((_, i) => i).sort((a, b) => pcaResult.points[a][0] - pcaResult.points[b][0]);

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (x) => x.toFixed(2);
const pct = (x) => `${Math.round(x * 100)}%`;

// ---------- Scroll essay ----------
// Each step lists keyframes. A keyframe is a technique id, or a technique id
// with one or more axes overridden — so a step can turn one number at a time.
const NEUTRAL = { grounding: 0.2, torso: 0.15, dynamics: 0.3, floor: 0, initiation: 0.5, structure: 0.95, fall: 0.05, contact: 0 };
const STEPS = [
  { focus: null, keys: [NEUTRAL] },
  { focus: 'grounding', keys: [{ base: 'butoh', grounding: 0.05 }, 'butoh'] },
  { focus: 'torso', keys: [{ base: 'graham', torso: 0.05 }, 'graham'] },
  { focus: 'dynamics', keys: [{ base: 'dunham', dynamics: 0.05 }, { base: 'dunham', dynamics: 0.95 }] },
  { focus: 'initiation', keys: ['forsythe', { base: 'forsythe', initiation: 0.95 }] },
  { focus: 'fall', keys: [{ base: 'limon', fall: 0.05 }, 'limon'] },
  { focus: 'floor', keys: [{ base: 'flyinglow', floor: 0.0 }, 'flyinglow'] },
  { focus: 'structure', keys: [{ base: 'gaga', structure: 1 }, 'gaga'] },
  { focus: 'contact', keys: [{ base: 'contact', contact: 0 }, 'contact'] },
];

function resolveKey(k) {
  if (typeof k === 'string') return { ...byId.get(k).scores };
  if (k.base) {
    const { base, ...over } = k;
    return { ...byId.get(base).scores, ...over };
  }
  return { ...k };
}
const resolvedSteps = STEPS.map((s) => ({ ...s, frames: s.keys.map(resolveKey) }));

function lerpParams(a, b, t) {
  const out = {};
  for (const k in a) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
const smooth = (t) => t * t * (3 - 2 * t);

const stage = $('#stage-figure');
const figure = createFigureScene(stage);
figure.snap(resolvedSteps[0].frames[0]);

const stepEls = [...document.querySelectorAll('.step')];
const navDots = $('#step-nav');
stepEls.forEach((el, i) => {
  const b = document.createElement('button');
  b.textContent = String(i + 1).padStart(2, '0');
  b.setAttribute('aria-label', `Go to section ${i + 1}`);
  b.addEventListener('click', () => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  navDots.appendChild(b);
});

// Fill in each step's caption: the focused axis and the values it moves through.
stepEls.forEach((el, i) => {
  const step = resolvedSteps[i];
  const cap = el.querySelector('.step-values');
  if (!cap || !step.focus) return;
  const ax = axes.find((a) => a.id === step.focus);
  const vals = step.frames.map((f) => fmt(f[step.focus]));
  cap.textContent = `${ax.label.toUpperCase()}  ${vals.join(' → ')}   ·   ${ax.low} ↔ ${ax.high}`;
});

let activeStep = -1;
function onScroll() {
  const mid = window.innerHeight * 0.55;
  let idx = 0;
  let progress = 0;
  stepEls.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.top <= mid) {
      idx = i;
      progress = Math.min(1, Math.max(0, (mid - r.top) / (r.height * 0.8)));
    }
  });
  const step = resolvedSteps[idx];
  const n = step.frames.length;
  let params;
  if (n === 1) params = step.frames[0];
  else {
    const f = smooth(progress) * (n - 1);
    const k = Math.min(n - 2, Math.floor(f));
    params = lerpParams(step.frames[k], step.frames[k + 1], f - k);
  }
  figure.setTarget(params);

  if (idx !== activeStep) {
    activeStep = idx;
    stepEls.forEach((el, i) => el.classList.toggle('is-active', i === idx));
    [...navDots.children].forEach((b, i) => b.classList.toggle('is-active', i === idx));
    document.querySelectorAll('.hud-row').forEach((row) => row.classList.toggle('is-focus', row.dataset.axis === step.focus));
  }
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Live readout of all eight numbers under the figure.
function buildHud(container) {
  container.innerHTML = axes
    .map(
      (a) => `<div class="hud-row" data-axis="${a.id}">
        <span class="hud-label">${a.label}</span>
        <span class="hud-bar"><i></i></span>
        <span class="hud-val">0.00</span>
      </div>`
    )
    .join('');
  const rows = axes.map((a) => ({
    id: a.id,
    bar: container.querySelector(`[data-axis="${a.id}"] i`),
    val: container.querySelector(`[data-axis="${a.id}"] .hud-val`),
  }));
  return (params) =>
    rows.forEach((r) => {
      r.bar.style.width = pct(params[r.id]);
      r.val.textContent = fmt(params[r.id]);
    });
}
const updateHud = buildHud($('#hud'));
const nearestLabel = $('#stage-nearest');
(function hudLoop() {
  const cur = figure.getCurrent();
  updateHud(cur);
  const nn = nearest(axes.map((a) => cur[a.id]), techniques, 1)[0];
  nearestLabel.textContent = `closest: ${nn.item.name} · ${pct(nn.sim)}`;
  requestAnimationFrame(hudLoop);
})();

// ---------- Technique card (side drawer) ----------
const drawer = $('#drawer');
const drawerBody = $('#drawer-body');
const wikiCache = new Map();
let morph;

async function fetchWiki(title) {
  if (!title) return null;
  if (wikiCache.has(title)) return wikiCache.get(title);
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!res.ok) throw new Error(res.status);
    const j = await res.json();
    const out = { text: j.extract, url: j.content_urls?.desktop?.page };
    wikiCache.set(title, out);
    return out;
  } catch {
    return null;
  }
}

function openTechnique(id) {
  const t = byId.get(id);
  if (!t) return;
  morph?.select(id);
  const nn = nearest(t.vec, techniques, 3, id);
  drawerBody.innerHTML = `
    <p class="eyebrow" style="color:${t.color}">${t.year} · ${t.place}</p>
    <h3>${t.name}</h3>
    <p class="founder">${t.founder}</p>
    <ul class="principles">${t.principles.map((p) => `<li>${p}</li>`).join('')}</ul>
    <div class="scorebars">
      ${axes
        .map(
          (a, i) => `<div class="sb-row" title="${a.desc}">
            <span>${a.label}</span>
            <span class="sb-track"><i style="left:${pct(t.vec[i])};background:${t.color}"></i></span>
            <span class="sb-ends">${a.low} · ${a.high}</span>
          </div>`
        )
        .join('')}
    </div>
    <p class="why"><strong>Why these numbers:</strong> ${t.why}</p>
    <h4>Nearest techniques</h4>
    <ul class="nn">${nn
      .map((n) => `<li><button data-open="${n.item.id}" style="--c:${n.item.color}">${n.item.name}</button><span>${pct(n.sim)}</span></li>`)
      .join('')}</ul>
    <div class="wiki"><p class="muted">Loading Wikipedia summary…</p></div>
    <button class="btn" data-try="${t.id}">Dance it in the explorer ↓</button>
  `;
  drawer.hidden = false;
  requestAnimationFrame(() => drawer.classList.add('is-open'));
  fetchWiki(t.wiki).then((w) => {
    const el = drawerBody.querySelector('.wiki');
    if (!el || drawerBody.dataset.id !== id) return;
    el.innerHTML = w
      ? `<p>${w.text}</p><a href="${w.url}" target="_blank" rel="noopener">Read on Wikipedia ↗</a>`
      : `<p class="muted">Wikipedia summary unavailable.</p>`;
  });
  drawerBody.dataset.id = id;
}

function closeDrawer() {
  drawer.classList.remove('is-open');
  setTimeout(() => (drawer.hidden = true), 250);
  morph?.select(null);
}
$('#drawer-close').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());
drawerBody.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) openTechnique(open.dataset.open);
  const tryIt = e.target.closest('[data-try]');
  if (tryIt) {
    setExplorer(byId.get(tryIt.dataset.try).scores);
    closeDrawer();
    $('#explore').scrollIntoView({ behavior: 'smooth' });
  }
});

// ---------- Morphospace ----------
morph = createMorphospace($('#morph-canvas'), {
  techniques,
  axes,
  pcaResult,
  simMatrix,
  onSelect: openTechnique,
});
$('#morph-variance').textContent = pcaResult.explained.map((e, i) => `PC${i + 1} ${pct(e)}`).join(' · ');
$('#morph-variance-total').textContent = pct(pcaResult.explained.reduce((a, b) => a + b, 0));

// ---------- Heatmap + pair comparison ----------
const pairBox = $('#pair');
function showPair(i, j) {
  const a = techniques[i];
  const b = techniques[j];
  const cmp = compareAxes(a.vec, b.vec, axes);
  const row = (r) =>
    `<li><strong>${r.axis.label}</strong> <span>${fmt(r.a)} / ${fmt(r.b)}</span></li>`;
  pairBox.innerHTML = `
    <p class="eyebrow">${pct(simMatrix[i][j])} similar</p>
    <h3><span style="color:${a.color}">${a.name}</span> × <span style="color:${b.color}">${b.name}</span></h3>
    <div class="pair-cols">
      <div><h4>Most alike</h4><ul>${cmp.shared.map(row).join('')}</ul></div>
      <div><h4>Most different</h4><ul>${cmp.different.map(row).join('')}</ul></div>
    </div>`;
}
drawHeatmap($('#heatmap'), { techniques, simMatrix, order: pcOrder, onPair: showPair, onSelect: openTechnique });
{
  // Open on the most similar pair so the panel is never empty.
  let best = [0, 1];
  simMatrix.forEach((row, i) => row.forEach((s, j) => i < j && s > simMatrix[best[0]][best[1]] && (best = [i, j])));
  showPair(...best);
}

// ---------- Lineage ----------
drawLineage($('#lineage'), { techniques, ancestors: data.ancestors, onSelect: openTechnique });

// ---------- Explorer ----------
const explorerFigure = createFigureScene($('#explore-figure'));
const sliders = $('#sliders');
sliders.innerHTML = axes
  .map(
    (a) => `<label class="slider" title="${a.desc}">
      <span class="slider-head"><span>${a.label}</span><output data-out="${a.id}">0.50</output></span>
      <input type="range" min="0" max="1" step="0.01" value="0.5" data-axis="${a.id}" />
      <span class="slider-ends"><span>${a.low}</span><span>${a.high}</span></span>
    </label>`
  )
  .join('');

const presets = $('#presets');
presets.innerHTML = techniques
  .map((t) => `<button data-preset="${t.id}" style="--c:${t.color}">${t.name}</button>`)
  .join('');
presets.addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (b) setExplorer(byId.get(b.dataset.preset).scores);
});

function readExplorer() {
  return Object.fromEntries([...sliders.querySelectorAll('input')].map((i) => [i.dataset.axis, +i.value]));
}
function setExplorer(params) {
  sliders.querySelectorAll('input').forEach((i) => (i.value = params[i.dataset.axis]));
  updateExplorer();
}
function updateExplorer() {
  const p = readExplorer();
  sliders.querySelectorAll('output').forEach((o) => (o.textContent = fmt(p[o.dataset.out])));
  explorerFigure.setTarget(p);
  const vec = axes.map((a) => p[a.id]);
  const nn = nearest(vec, techniques, 3);
  $('#explore-nearest').innerHTML = nn
    .map(
      (n) =>
        `<li><button data-open="${n.item.id}" style="--c:${n.item.color}">${n.item.name}</button><span class="bar"><i style="width:${pct(n.sim)};background:${n.item.color}"></i></span><span>${pct(n.sim)}</span></li>`
    )
    .join('');
  morph.showCustom(vec);
}
sliders.addEventListener('input', updateExplorer);
$('#explore-nearest').addEventListener('click', (e) => {
  const b = e.target.closest('[data-open]');
  if (b) openTechnique(b.dataset.open);
});
$('#randomise').addEventListener('click', () => setExplorer(Object.fromEntries(axes.map((a) => [a.id, Math.round(Math.random() * 100) / 100]))));
setExplorer(NEUTRAL);

// ---------- Theme toggle ----------
const themeBtn = $('#theme-toggle');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
}
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('dance-theme', next);
  } catch {}
  // Charts and 3D materials read CSS colours at build time, so reload to repaint them.
  location.reload();
});
applyTheme(document.documentElement.dataset.theme || 'dark');
