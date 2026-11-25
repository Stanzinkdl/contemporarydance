# One Body, Eight Numbers

A scroll essay and interactive 3D map of contemporary dance techniques — Graham, Horton, Limón, Dunham, Cunningham, Butoh, Release, Contact Improvisation, Forsythe's Improvisation Technologies, Flying Low, Gaga and Countertechnique.

Inspired by David Raup's 1966 shell morphospace: every technique is described by the same eight numbers, and a procedural 3D dancer moves according to those numbers.

## Sections

1. **Scroll essay**: one axis changes at a time while the figure dances it live.
2. **Morphospace**: all techniques in 3D, placed by principal component analysis, with arrows showing each axis's pull.
3. **Kinship**: similarity matrix; tap any pair to compare.
4. **Lineage**: who learned from whom, over time.
5. **Explorer**: set the eight sliders to invent a technique and find its nearest relatives.

## The eight axes

| Axis | 0 | 1 |
|---|---|---|
| Weight | lifted | grounded |
| Torso | vertical, held | curved, spiralling |
| Dynamics | sustained | percussive |
| Floor | upright | floor-based |
| Initiation | periphery | centre |
| Structure | improvised | codified |
| Balance | held | fall & recovery |
| Contact | solo | shared weight |

Scores are interpretive, not measured. Each technique carries a short `why` explaining its numbers. Edit [`src/data/techniques.json`](src/data/techniques.json) to add techniques or argue with the scores; every view updates.

## Tech

- [Vite](https://vitejs.dev) build, static output
- [Three.js](https://threejs.org) for the procedural dancer and the 3D morphospace
- [D3](https://d3js.org) for the similarity matrix and lineage chart
- Similarity = 1 − normalised Euclidean distance; PCA implemented in `src/similarity.js`
- Technique cards pull a summary from the Wikipedia REST API

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
