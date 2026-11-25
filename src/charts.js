import * as d3 from 'd3';

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Similarity heatmap. Rows are ordered along the first principal component so
// neighbouring techniques sit next to each other and clusters show as blocks.
export function drawHeatmap(container, { techniques, simMatrix, order, onPair, onSelect }) {
  container.innerHTML = '';
  const n = techniques.length;
  const cell = 34;
  const labelW = 170;
  const size = cell * n;
  const W = labelW + size + 110; // room for the rotated column labels
  const H = labelW + size + 10;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', W)
    .attr('role', 'img')
    .attr('aria-label', 'Similarity matrix between dance techniques');

  const offDiag = simMatrix.flatMap((row, i) => row.filter((_, j) => i !== j));
  const color = d3
    .scaleSequential()
    .domain([d3.min(offDiag), d3.max(offDiag)])
    .interpolator(d3.interpolateRgb(cssVar('--surface', '#1c1b1a'), cssVar('--accent', '#e0603a')));

  const g = svg.append('g').attr('transform', `translate(${labelW},${labelW})`);

  const rows = order.map((i) => techniques[i]);
  const pos = new Map(order.map((idx, k) => [idx, k]));

  const cells = [];
  order.forEach((i) =>
    order.forEach((j) => {
      cells.push({ i, j, s: simMatrix[i][j] });
    })
  );

  g.selectAll('rect')
    .data(cells)
    .join('rect')
    .attr('x', (d) => pos.get(d.j) * cell)
    .attr('y', (d) => pos.get(d.i) * cell)
    .attr('width', cell - 2)
    .attr('height', cell - 2)
    .attr('rx', 3)
    .attr('fill', (d) => (d.i === d.j ? cssVar('--line', '#444') : color(d.s)))
    .attr('class', 'hm-cell')
    .on('click', (_, d) => d.i !== d.j && onPair?.(d.i, d.j))
    .append('title')
    .text((d) => `${techniques[d.i].name} × ${techniques[d.j].name}: ${Math.round(d.s * 100)}% similar`);

  g.selectAll('text.hm-val')
    .data(cells.filter((d) => d.i !== d.j))
    .join('text')
    .attr('class', 'hm-val')
    .attr('x', (d) => pos.get(d.j) * cell + cell / 2 - 1)
    .attr('y', (d) => pos.get(d.i) * cell + cell / 2 + 3)
    .attr('text-anchor', 'middle')
    .text((d) => Math.round(d.s * 100));

  const rowLabels = svg.append('g').attr('transform', `translate(${labelW - 8},${labelW})`);
  rowLabels
    .selectAll('text')
    .data(rows)
    .join('text')
    .attr('class', 'hm-label')
    .attr('y', (_, k) => k * cell + cell / 2 + 3)
    .attr('text-anchor', 'end')
    .text((t) => t.name)
    .on('click', (_, t) => onSelect?.(t.id));

  const colLabels = svg.append('g').attr('transform', `translate(${labelW},${labelW - 8})`);
  colLabels
    .selectAll('text')
    .data(rows)
    .join('text')
    .attr('class', 'hm-label')
    .attr('transform', (_, k) => `translate(${k * cell + cell / 2 + 3},0) rotate(-55)`)
    .text((t) => t.name)
    .on('click', (_, t) => onSelect?.(t.id));
}

// Radar profile of one technique's eight numbers, with the average of all
// techniques as a dashed outline for reference.
const SHORT = { grounding: 'Weight', torso: 'Torso', dynamics: 'Dyn.', floor: 'Floor', initiation: 'Init.', structure: 'Struct.', fall: 'Balance', contact: 'Contact' };
export function drawRadar(container, { values, mean, axes, color, size = 190 }) {
  const r = size / 2 - 26;
  const n = axes.length;
  const angle = (i) => (i / n) * Math.PI * 2;
  const pt = (v, i) => [Math.sin(angle(i)) * r * v, -Math.cos(angle(i)) * r * v];
  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`)
    .attr('role', 'img')
    .attr('aria-label', axes.map((a, i) => `${a.label} ${values[i].toFixed(2)}`).join(', '));

  [0.25, 0.5, 0.75, 1].forEach((v) =>
    svg.append('polygon').attr('class', 'radar-ring').attr('points', axes.map((_, i) => pt(v, i).join(',')).join(' '))
  );
  axes.forEach((a, i) => {
    const [x, y] = pt(1, i);
    svg.append('line').attr('class', 'radar-spoke').attr('x1', 0).attr('y1', 0).attr('x2', x).attr('y2', y);
    const [lx, ly] = pt(1.2, i);
    svg
      .append('text')
      .attr('class', 'radar-label')
      .attr('x', lx)
      .attr('y', ly + 3)
      .attr('text-anchor', Math.abs(lx) < 4 ? 'middle' : lx > 0 ? 'start' : 'end')
      .text(SHORT[a.id] ?? a.label);
  });
  svg.append('polygon').attr('class', 'radar-mean').attr('points', mean.map((v, i) => pt(v, i).join(',')).join(' '));
  svg
    .append('polygon')
    .attr('points', values.map((v, i) => pt(v, i).join(',')).join(' '))
    .attr('fill', color)
    .attr('fill-opacity', 0.28)
    .attr('stroke', color)
    .attr('stroke-width', 2)
    .attr('stroke-linejoin', 'round');
  values.forEach((v, i) => {
    const [x, y] = pt(v, i);
    svg.append('circle').attr('cx', x).attr('cy', y).attr('r', 2.5).attr('fill', color);
  });
}

// Lineage map: time runs left to right; lines connect teachers to the techniques
// that grew out of them. Grey hollow nodes are ancestors without scores.
export function drawLineage(container, { techniques, ancestors, onSelect }) {
  container.innerHTML = '';
  const W = 960;
  const H = 560;
  const m = { top: 30, right: 150, bottom: 40, left: 30 };

  const nodes = [
    ...ancestors.map((a) => ({ ...a, ancestor: true })),
    ...techniques.map((t) => ({ id: t.id, name: t.name, year: t.year, parents: t.parents, color: t.color })),
  ];
  const byId = new Map(nodes.map((d) => [d.id, d]));
  const links = nodes.flatMap((d) => (d.parents || []).filter((p) => byId.has(p)).map((p) => ({ source: byId.get(p), target: d })));

  const x = d3.scaleLinear().domain([1895, 2010]).range([m.left, W - m.right]);

  // Lane layout: x is fixed by year. Each node tries to sit in its first
  // parent's lane, and otherwise takes the nearest lane whose last label has
  // already ended, so labels never overlap.
  const LANES = 12;
  const laneGap = (H - m.top - m.bottom) / (LANES - 1);
  const laneEnd = new Array(LANES).fill(-Infinity);
  const labelWidth = (d) => (d.name.length + 7) * 6.6 + 24;
  const order = [...nodes].sort((a, b) => a.year - b.year);
  order.forEach((d, k) => {
    d.fx = x(d.year);
    const parent = (d.parents || []).map((p) => byId.get(p)).find((p) => p && p.lane != null);
    const preferred = parent ? parent.lane : (k * 3) % LANES;
    const candidates = d3.range(LANES).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
    d.lane = candidates.find((l) => laneEnd[l] < d.fx - 8) ?? candidates[0];
    laneEnd[d.lane] = d.fx + labelWidth(d);
    d.y = m.top + d.lane * laneGap;
  });

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img')
    .attr('aria-label', 'Lineage of contemporary dance techniques over time');

  svg
    .append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${H - 18})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(10).tickSize(-(H - 40)))
    .call((g) => g.select('.domain').remove());

  svg
    .append('g')
    .selectAll('path')
    .data(links)
    .join('path')
    .attr('class', 'lin-link')
    .attr('d', (l) => {
      const sx = l.source.fx, sy = l.source.y, tx = l.target.fx, ty = l.target.y;
      const mx = (sx + tx) / 2;
      return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
    });

  const node = svg
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', (d) => (d.ancestor ? 'lin-node is-ancestor' : 'lin-node'))
    .attr('transform', (d) => `translate(${d.fx},${d.y})`)
    .on('click', (_, d) => !d.ancestor && onSelect?.(d.id));

  node
    .append('circle')
    .attr('r', (d) => (d.ancestor ? 5 : 7))
    .attr('fill', (d) => (d.ancestor ? 'none' : d.color));

  node
    .append('text')
    .attr('x', 11)
    .attr('y', 4)
    .text((d) => `${d.name} · ${d.year}`);
}
