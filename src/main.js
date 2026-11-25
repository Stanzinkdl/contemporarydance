import './style.css';
import data from './data/techniques.json';
import { toVector, similarityMatrix, pca, nearest, compareAxes } from './similarity.js';
import { createFigureScene } from './figure.js';
import { createMorphospace } from './morphospace.js';
import { drawHeatmap, drawLineage, drawRadar } from './charts.js';

// ---------- Data prep ----------
const PALETTE = ['#e0603a', '#e8a33d', '#c9c04a', '#7fb069', '#3fa7a0', '#4a90c9', '#7b6fd6', '#b65fc4', '#d4588f', '#a37b5c', '#8fa3b0', '#d98c6c'];
const axes = data.axes;
const axisById = new Map(axes.map((a) => [a.id, a]));
const techniques = data.techniques.map((t, i) => ({ ...t, color: PALETTE[i % PALETTE.length], vec: toVector(t.scores, axes) }));
const byId = new Map(techniques.map((t) => [t.id, t]));
const vectors = techniques.map((t) => t.vec);
const simMatrix = similarityMatrix(vectors);
const pcaResult = pca(vectors, 3);
const pcOrder = techniques.map((_, i) => i).sort((a, b) => pcaResult.points[a][0] - pcaResult.points[b][0]);
const meanVec = axes.map((_, k) => vectors.reduce((s, v) => s + v[k], 0) / vectors.length);
const stdVec = axes.map((_, k) => Math.sqrt(vectors.reduce((s, v) => s + (v[k] - meanVec[k]) ** 2, 0) / vectors.length));

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (x) => x.toFixed(2);
const pct = (x) => `${Math.round(x * 100)}%`;
const chip = (t) => `<button class="tchip" data-open="${t.id}" style="--c:${t.color}">${t.name}</button>`;

// ---------- Figure style (skeleton / body) ----------
let figStyle = 'skeleton';
try {
  const s = localStorage.getItem('dance-figure');
  if (s === 'skeleton' || s === 'body') figStyle = s;
} catch {}
const figures = [];
function syncStyleButtons() {
  document.querySelectorAll('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === figStyle)));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-style]');
  if (!b) return;
  figStyle = b.dataset.style;
  try {
    localStorage.setItem('dance-figure', figStyle);
  } catch {}
  figures.forEach((f) => f.setStyle(figStyle));
  syncStyleButtons();
});
syncStyleButtons();

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

const figure = createFigureScene($('#stage-figure'), { style: figStyle });
figures.push(figure);
figure.snap(resolvedSteps[0].frames[0]);
let explorerFigure = null; // created further down, in the explorer section

const stepEls = [...document.querySelectorAll('.step')];
const navDots = $('#step-nav');
stepEls.forEach((el, i) => {
  const b = document.createElement('button');
  b.textContent = String(i + 1).padStart(2, '0');
  b.setAttribute('aria-label', `Go to section ${i + 1}`);
  b.addEventListener('click', () => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  navDots.appendChild(b);
});

// Fill in each step's caption and a link to that parameter's theory.
stepEls.forEach((el, i) => {
  const step = resolvedSteps[i];
  const cap = el.querySelector('.step-values');
  if (!cap || !step.focus) return;
  const ax = axisById.get(step.focus);
  const vals = step.frames.map((f) => fmt(f[step.focus]));
  cap.textContent = `${ax.label.toUpperCase()}  ${vals.join(' → ')}   ·   ${ax.low} ↔ ${ax.high}`;
  const more = document.createElement('a');
  more.className = 'step-more';
  more.href = `#axis-${ax.id}`;
  more.textContent = `The theory of ${ax.label.toLowerCase()} →`;
  cap.after(more);
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

// The phrase as a row of numbered step chips; the current step is lit.
function phraseRenderer(el) {
  let sig = '';
  let active = -1;
  return (step) => {
    // The closing "Stand" is the same as the opening one, so it isn't shown twice.
    const steps = step.steps.slice(0, -1);
    const s = steps.join('|');
    if (s !== sig) {
      sig = s;
      active = -1;
      el.innerHTML = steps.map((name, i) => `<li><span>${i + 1}</span>${name}</li>`).join('');
    }
    const idx = step.index % steps.length;
    if (idx !== active) {
      active = idx;
      [...el.children].forEach((li, i) => li.classList.toggle('is-active', i === idx));
    }
  };
}
const renderStagePhrase = phraseRenderer($('#stage-steps'));
const renderExplorePhrase = phraseRenderer($('#explore-steps'));

const nearestLabel = $('#stage-nearest');
(function hudLoop() {
  const cur = figure.getCurrent();
  updateHud(cur);
  renderStagePhrase(figure.getStep());
  if (explorerFigure) renderExplorePhrase(explorerFigure.getStep());
  const nn = nearest(axes.map((a) => cur[a.id]), techniques, 1)[0];
  nearestLabel.textContent = `closest: ${nn.item.name} · ${pct(nn.sim)}`;
  requestAnimationFrame(hudLoop);
})();

// ---------- The eight parameters, in depth ----------
// Dots that share nearly the same value stack upward so none hide each other.
function stackDots(items, gap = 0.04) {
  const levels = [];
  return items
    .slice()
    .sort((a, b) => a.v - b.v)
    .map((it) => {
      let lvl = 0;
      while ((levels[lvl] ?? -Infinity) > it.v - gap) lvl++;
      levels[lvl] = it.v;
      return { ...it, lvl };
    });
}

function renderAxisCards() {
  $('#axis-cards').innerHTML = axes
    .map((a, k) => {
      const items = techniques.map((t) => ({ t, v: t.vec[k] }));
      const dots = stackDots(items);
      const maxLvl = Math.max(...dots.map((d) => d.lvl));
      const ranked = [...items].sort((x, y) => y.v - x.v);
      return `
      <article class="axis-card" id="axis-${a.id}">
        <header class="axis-head">
          <span class="axis-num">${String(k + 1).padStart(2, '0')}</span>
          <div>
            <h3>${a.label}</h3>
            <p class="axis-range"><span>0 · ${a.low}</span><span>1 · ${a.high}</span></p>
          </div>
        </header>
        <div class="axis-body">
          <div class="axis-text">
            <p class="axis-desc">${a.desc}</p>
            <p>${a.theory}</p>
            <ul class="roots">${a.roots.map((r) => `<li>${r}</li>`).join('')}</ul>
            <p class="watch"><strong>How to see it:</strong> ${a.watch}</p>
          </div>
          <div class="axis-data">
            <h4>Where the techniques fall</h4>
            <div class="strip" style="--levels:${maxLvl + 1}">
              <div class="strip-track"><i style="left:${pct(meanVec[k])}" class="strip-mean" title="Average ${fmt(meanVec[k])}"></i></div>
              ${dots
                .map(
                  (d) =>
                    `<button class="strip-dot" data-open="${d.t.id}" style="left:${pct(d.v)};bottom:${d.lvl * 16 + 14}px;--c:${d.t.color}" title="${d.t.name}: ${fmt(d.v)}"></button>`
                )
                .join('')}
            </div>
            <div class="strip-ends"><span>${a.low}</span><span class="muted">avg ${fmt(meanVec[k])}</span><span>${a.high}</span></div>
            <ol class="ranked">${ranked.map((d) => `<li>${chip(d.t)}<span>${fmt(d.v)}</span></li>`).join('')}</ol>
            <h4>Scoring guide</h4>
            <dl class="rubric">${Object.entries(a.rubric)
              .sort((x, y) => +x[0] - +y[0]) // JS orders "0" and "1" before "0.5"
              .map(([v, txt]) => `<dt>${v}</dt><dd>${txt}</dd>`)
              .join('')}</dl>
          </div>
        </div>
      </article>`;
    })
    .join('');
}
renderAxisCards();

// ---------- What tells them apart ----------
const AXIS_INSIGHT = {
  structure: 'The deepest split in contemporary dance is about method rather than shape: a set syllabus versus improvisation from tasks and images.',
  contact: 'One technique, Contact Improvisation, pulls this axis wide on its own; for the rest, partnering is optional.',
  fall: 'Techniques disagree on whether balance is something to protect or something to give away.',
  floor: 'Floor use separates the newer, release-based forms from the standing, codified ones.',
  initiation: 'Centre-led and limb-led techniques form clear camps, with Forsythe and Cunningham at the limb end.',
  dynamics: 'Dynamics range from Butoh\'s near-stillness to Graham\'s strikes, but most techniques sit in the middle.',
  grounding: 'Most techniques lean grounded; only the ballet-influenced ones stay lifted.',
  torso: 'Almost every technique here frees the spine. That shared value is part of what makes them "modern" or "contemporary" rather than classical.',
};

function renderSpread() {
  const rows = axes.map((a, k) => ({ a, sd: stdVec[k] })).sort((x, y) => y.sd - x.sd);
  const max = rows[0].sd;
  $('#spread').innerHTML = rows
    .map(
      (r) => `<div class="bar-row"><a href="#axis-${r.a.id}">${r.a.label}</a><span class="bar"><i style="width:${(r.sd / max) * 100}%"></i></span><span class="mono">σ ${r.sd.toFixed(2)}</span></div>`
    )
    .join('');
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  $('#spread-note').innerHTML = `<strong>${top.a.label}</strong> varies most. ${AXIS_INSIGHT[top.a.id]} <strong>${bottom.a.label}</strong> varies least. ${AXIS_INSIGHT[bottom.a.id]}`;
}
renderSpread();

function renderComponents() {
  const order = (k) => techniques.map((t, i) => ({ t, v: pcaResult.points[i][k] })).sort((a, b) => b.v - a.v);
  $('#pcs').innerHTML = pcaResult.components
    .map((comp, k) => {
      const load = axes.map((a, j) => ({ a, w: comp[j] })).sort((x, y) => Math.abs(y.w) - Math.abs(x.w));
      const strong = load.slice(0, 3);
      const plus = strong.map((l) => (l.w > 0 ? l.a.high : l.a.low));
      const minus = strong.map((l) => (l.w > 0 ? l.a.low : l.a.high));
      const ranked = order(k);
      return `
      <div class="pc">
        <p class="eyebrow">Direction ${k + 1} · ${pct(pcaResult.explained[k])} of the differences</p>
        <p class="pc-pole"><span class="pole">+</span> ${plus.join(', ')} <span class="pc-ex">${ranked.slice(0, 2).map((r) => chip(r.t)).join('')}</span></p>
        <p class="pc-pole"><span class="pole">−</span> ${minus.join(', ')} <span class="pc-ex">${ranked.slice(-2).reverse().map((r) => chip(r.t)).join('')}</span></p>
        <div class="loadings">${axes
          .map((a, j) => {
            const w = comp[j];
            return `<div class="load-row"><span>${a.label}</span><span class="dbar"><i style="${w >= 0 ? 'left:50%' : `right:50%`};width:${Math.abs(w) * 50}%"></i></span><span class="mono">${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(2)}</span></div>`;
          })
          .join('')}</div>
      </div>`;
    })
    .join('');
}
renderComponents();

function renderRadars() {
  const host = $('#radars');
  host.innerHTML = '';
  techniques.forEach((t) => {
    const card = document.createElement('button');
    card.className = 'radar-card';
    card.dataset.open = t.id;
    card.style.setProperty('--c', t.color);
    card.innerHTML = `<div class="radar"></div><strong>${t.name}</strong><span class="muted">${t.founder.split(' (')[0]} · ${t.year}</span><span class="radar-sum">${t.summary}</span>`;
    host.appendChild(card);
    drawRadar(card.querySelector('.radar'), { values: t.vec, mean: meanVec, axes, color: t.color });
  });
}
renderRadars();

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

// The axes on which a technique departs most from the average of all twelve.
function signatureAxes(t, n = 3) {
  return axes
    .map((a, k) => ({ a, v: t.vec[k], d: t.vec[k] - meanVec[k], z: stdVec[k] ? (t.vec[k] - meanVec[k]) / stdVec[k] : 0 }))
    .sort((x, y) => Math.abs(y.z) - Math.abs(x.z))
    .slice(0, n);
}

function openTechnique(id) {
  const t = byId.get(id);
  if (!t) return;
  morph?.select(id);
  const nn = nearest(t.vec, techniques, 3, id);
  const sig = signatureAxes(t);
  drawerBody.dataset.id = id;
  drawerBody.innerHTML = `
    <p class="eyebrow" style="color:${t.color}">${t.year} · ${t.place}</p>
    <h3>${t.name}</h3>
    <p class="founder">${t.founder}</p>
    <p class="lede">${t.summary}</p>

    <h4>History</h4>
    <p>${t.history}</p>

    <h4>Key concepts</h4>
    <dl class="concepts">${t.concepts.map((c) => `<dt>${c.term}</dt><dd>${c.desc}</dd>`).join('')}</dl>

    <h4>Principles</h4>
    <ul class="principles">${t.principles.map((p) => `<li>${p}</li>`).join('')}</ul>

    <h4>In class</h4>
    <ul class="principles">${t.exercises.map((p) => `<li>${p}</li>`).join('')}</ul>

    <h4>The eight numbers</h4>
    <p class="muted small">Each dot is this technique's score; the tick is the average of all twelve.</p>
    <div class="scorebars">
      ${axes
        .map(
          (a, i) => `<div class="sb-row">
            <a href="#axis-${a.id}" class="sb-label">${a.label}</a>
            <span class="sb-track"><b style="left:${pct(meanVec[i])}"></b><i style="left:${pct(t.vec[i])};background:${t.color}"></i></span>
            <span class="mono sb-val">${fmt(t.vec[i])}</span>
            <span class="sb-ends">${a.low} · ${a.high}</span>
            <span class="sb-note">${t.notes?.[a.id] ?? ''}</span>
          </div>`
        )
        .join('')}
    </div>

    <h4>What sets it apart</h4>
    <p>${t.distinct}</p>
    <ul class="sig">${sig
      .map(
        (s) =>
          `<li><strong>${s.a.label}</strong>: ${s.d > 0 ? 'more' : 'less'} ${s.a.high} than average <span class="mono">(${fmt(s.v)} vs ${fmt(meanVec[axes.indexOf(s.a)])})</span></li>`
      )
      .join('')}</ul>

    <h4>Nearest techniques</h4>
    <ul class="nn">${nn
      .map((n) => `<li>${chip(n.item)}<span class="bar"><i style="width:${pct(n.sim)};background:${n.item.color}"></i></span><span>${pct(n.sim)}</span></li>`)
      .join('')}</ul>

    <h4>Key works</h4>
    <ul class="principles">${t.works.map((w) => `<li>${w}</li>`).join('')}</ul>
    <p class="muted">${t.legacy}</p>

    <h4>From Wikipedia</h4>
    <div class="wiki"><p class="muted">${t.wiki ? 'Loading…' : 'No dedicated Wikipedia article.'}</p></div>
    <button class="btn" data-try="${t.id}">Dance it in the explorer ↓</button>
  `;
  drawer.hidden = false;
  drawer.scrollTop = 0;
  requestAnimationFrame(() => drawer.classList.add('is-open'));
  if (t.wiki)
    fetchWiki(t.wiki).then((w) => {
      const el = drawerBody.querySelector('.wiki');
      if (!el || drawerBody.dataset.id !== id) return;
      el.innerHTML = w
        ? `<p>${w.text}</p><a href="${w.url}" target="_blank" rel="noopener">Read on Wikipedia ↗</a>`
        : `<p class="muted">Wikipedia summary unavailable.</p>`;
    });
}

function closeDrawer() {
  drawer.classList.remove('is-open');
  setTimeout(() => (drawer.hidden = true), 250);
  morph?.select(null);
}
$('#drawer-close').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());

// Any element with data-open anywhere on the page opens that technique.
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) {
    e.preventDefault();
    openTechnique(open.dataset.open);
    return;
  }
  const tryIt = e.target.closest('[data-try]');
  if (tryIt) {
    setExplorer(byId.get(tryIt.dataset.try).scores);
    closeDrawer();
    $('#explore').scrollIntoView({ behavior: 'smooth' });
  }
  // Links into the parameter section close the drawer so the target is visible.
  if (e.target.closest('#drawer a[href^="#axis-"]')) closeDrawer();
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
  const big = cmp.different[0].axis;
  pairBox.innerHTML = `
    <p class="eyebrow">${pct(simMatrix[i][j])} similar</p>
    <h3><span style="color:${a.color}">${a.name}</span> × <span style="color:${b.color}">${b.name}</span></h3>
    <div class="dumbbells">
      ${axes
        .map((ax, k) => {
          const lo = Math.min(a.vec[k], b.vec[k]);
          const hi = Math.max(a.vec[k], b.vec[k]);
          return `<div class="db-row"><span>${ax.label}</span><span class="db-track">
            <em style="left:${pct(lo)};width:${pct(hi - lo)}"></em>
            <i style="left:${pct(a.vec[k])};background:${a.color}" title="${a.name} ${fmt(a.vec[k])}"></i>
            <i style="left:${pct(b.vec[k])};background:${b.color}" title="${b.name} ${fmt(b.vec[k])}"></i>
          </span></div>`;
        })
        .join('')}
    </div>
    <p class="muted small">Most alike on ${cmp.shared.map((r) => r.axis.label.toLowerCase()).join(', ')}. Most different on ${cmp.different.map((r) => r.axis.label.toLowerCase()).join(', ')}.</p>
    <h4>The biggest difference: ${big.label.toLowerCase()}</h4>
    <p><strong style="color:${a.color}">${a.name}</strong> (${fmt(a.scores[big.id])}): ${a.notes?.[big.id] ?? ''}</p>
    <p><strong style="color:${b.color}">${b.name}</strong> (${fmt(b.scores[big.id])}): ${b.notes?.[big.id] ?? ''}</p>`;
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
explorerFigure = createFigureScene($('#explore-figure'), { style: figStyle });
figures.push(explorerFigure);
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
presets.innerHTML = techniques.map((t) => `<button data-preset="${t.id}" style="--c:${t.color}">${t.name}</button>`).join('');
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
    .map((n) => `<li>${chip(n.item)}<span class="bar"><i style="width:${pct(n.sim)};background:${n.item.color}"></i></span><span>${pct(n.sim)}</span></li>`)
    .join('');
  morph.showCustom(vec);
}
sliders.addEventListener('input', updateExplorer);
$('#randomise').addEventListener('click', () => setExplorer(Object.fromEntries(axes.map((a) => [a.id, Math.round(Math.random() * 100) / 100]))));
setExplorer(NEUTRAL);

// ---------- Theme toggle ----------
const themeBtn = $('#theme-toggle');
themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀ Light' : '☾ Dark';
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('dance-theme', next);
  } catch {}
  // Charts and 3D materials read CSS colours at build time, so reload to repaint them.
  location.reload();
});
