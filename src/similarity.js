// Similarity math for technique score vectors.
// Vectors are plain arrays of numbers in [0, 1], one per axis.

export function toVector(scores, axes) {
  return axes.map((a) => scores[a.id] ?? 0.5);
}

// Similarity in [0, 1] based on Euclidean distance.
// Cosine similarity is a poor fit here: all scores are positive, so every pair
// looks "similar". Distance in the unit cube tells techniques apart much better.
export function similarity(a, b) {
  const maxDist = Math.sqrt(a.length); // diagonal of the unit hypercube
  return 1 - distance(a, b) / maxDist;
}

export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export function similarityMatrix(vectors) {
  return vectors.map((a) => vectors.map((b) => similarity(a, b)));
}

// Axes on which two techniques agree most closely, and differ most.
export function compareAxes(a, b, axes) {
  const rows = axes.map((ax, i) => ({ axis: ax, a: a[i], b: b[i], diff: Math.abs(a[i] - b[i]) }));
  const sorted = [...rows].sort((x, y) => x.diff - y.diff);
  return { shared: sorted.slice(0, 3), different: sorted.slice(-3).reverse() };
}

export function nearest(vec, items, k = 3, excludeId = null) {
  return items
    .filter((t) => t.id !== excludeId)
    .map((t) => ({ item: t, sim: similarity(vec, t.vec) }))
    .sort((x, y) => y.sim - x.sim)
    .slice(0, k);
}

// Principal component analysis via power iteration with deflation.
// Small and dependency-free; fine for a dozen points in 8 dimensions.
export function pca(vectors, nComponents = 3) {
  const n = vectors.length;
  const d = vectors[0].length;
  const mean = new Array(d).fill(0);
  vectors.forEach((v) => v.forEach((x, i) => (mean[i] += x / n)));
  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

  // Covariance matrix (d x d)
  let cov = Array.from({ length: d }, () => new Array(d).fill(0));
  centered.forEach((v) => {
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cov[i][j] += (v[i] * v[j]) / (n - 1);
  });

  const components = [];
  const variances = [];
  for (let c = 0; c < nComponents; c++) {
    // Deterministic start vector so the layout is stable between reloads.
    let vec = Array.from({ length: d }, (_, i) => 1 / Math.sqrt(d) + (i === c ? 0.5 : 0));
    let lambda = 0;
    for (let iter = 0; iter < 500; iter++) {
      const next = cov.map((row) => row.reduce((s, x, j) => s + x * vec[j], 0));
      const norm = Math.hypot(...next) || 1;
      vec = next.map((x) => x / norm);
      lambda = norm;
    }
    // Fix the sign so the largest loading is positive (stable orientation).
    const maxIdx = vec.reduce((m, x, i) => (Math.abs(x) > Math.abs(vec[m]) ? i : m), 0);
    if (vec[maxIdx] < 0) vec = vec.map((x) => -x);
    components.push(vec);
    variances.push(lambda);
    // Deflate: remove this component from the covariance matrix.
    cov = cov.map((row, i) => row.map((x, j) => x - lambda * vec[i] * vec[j]));
  }

  const totalVar = centered.reduce((s, v) => s + v.reduce((a, x) => a + x * x, 0), 0) / (n - 1);
  const project = (v) => components.map((comp) => comp.reduce((s, w, i) => s + w * (v[i] - mean[i]), 0));

  return {
    mean,
    components, // each: loadings per axis
    explained: variances.map((v) => v / totalVar),
    points: vectors.map(project),
    project,
  };
}
