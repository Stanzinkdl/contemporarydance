# One Body, Eight Numbers

A scroll essay and interactive 3D map of eighteen modern and contemporary dance techniques — Wigman, Graham, Humphrey–Weidman, Horton, Dunham, Limón, Hawkins, Cunningham, Nikolais/Louis, Taylor, Butoh, Release, Contact Improvisation, Klein, Forsythe's Improvisation Technologies, Flying Low, Gaga and Countertechnique — and the dancers who created them.

Inspired by David Raup's 1966 shell morphospace: every technique is described by the same eight numbers, and a procedural 3D dancer moves according to those numbers.

## Sections

1. **Scroll essay**: one axis changes at a time while the figure dances it live.
2. **Morphospace**: all techniques in 3D, placed by principal component analysis, with arrows showing each axis's pull.
3. **Kinship**: similarity matrix; tap any pair to compare.
4. **Lineage**: who learned from whom, over time.
5. **Inside the studio**: meet each technique's founders (biography, training, core idea, students), walk through a typical class section by section with the skeleton demonstrating, and browse the signature steps, each with its own figure and explanation.
6. **Explorer**: set the eight sliders to invent a technique and find its nearest relatives.
7. **Recorded dancers**: motion-capture playback on the same skeleton.

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

## The dancer

- **Skeleton:** real anatomical bone meshes from [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/) (229 bones: skull, vertebrae, ribs and cartilage, pelvis, limbs, hand and foot bones). Joint centres are measured from the bones themselves (e.g. the hip is the centre of the femoral head), so the rig has real human proportions.
- **Choreographed phrases:** each technique dances its own class material (`src/phrases.js`): Graham seated breathings, spirals and pleadings; Horton flat back, lateral T, hinge and coccyx balance; Limón swings, suspension and falls; Dunham isolations and walks; Cunningham's five back positions with tendu and attitude; Butoh ganimata and slow walks; Release constructive rest and roll-ups; a Contact duet (lean, counterbalance, table); Forsythe's point–line, inscription and extrusion; Flying Low spirals and rolls; Gaga float, quake and waves; Countertechnique counter-directions.
- **Recorded dancers:** five motion-capture recordings of modern dancers from the CMU database, played on the same skeleton (rotations only, so bones keep their proportions).
- **Flexible rig:** 24 segments including a two-part thoracic spine, shoulder girdles with automatic shoulder-blade rhythm, curling fingers and toes that stay flat on half-toe. Sustained techniques flow through poses on a spline; percussive ones strike and hold.
- **Free 3D view:** drag any figure to orbit 360°, right-drag to pan, Ctrl/⌘ + scroll or pinch to zoom, or use Front / Side / Back / Above. Add `?cam=side` to the URL to start in profile.

## Rebuilding the data

The processed files (`public/skeleton/bones.bin`, `src/data/skeleton.json`, `public/mocap/*.json`) are committed. To rebuild them from the original sources:

```bash
# BodyParts3D: download and unzip partof_BP3D_4.0_obj_99.zip from the BodyParts3D site
node tools/build-skeleton.mjs path/to/partof_BP3D_4.0_obj_99 public/skeleton
# CMU mocap: download 05.asf, 05_02.amc, 05_04.amc, 49.asf, 49_10.amc, 49_12.amc, 49_22.amc
node tools/build-mocap.mjs path/to/mocap public/mocap
```

## Tech

- [Vite](https://vitejs.dev) build, static output
- [Three.js](https://threejs.org) for the procedural dancer and the 3D morphospace
- [D3](https://d3js.org) for the similarity matrix and lineage chart
- Similarity = 1 − normalised Euclidean distance; PCA implemented in `src/similarity.js`
- Technique cards pull a summary from the Wikipedia REST API
- [meshoptimizer](https://github.com/zeux/meshoptimizer) to simplify the bone meshes (build step only)

## Credits

- **Skeleton:** BodyParts3D, © The Database Center for Life Science, licensed under [CC Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (the OBJ file headers carry the earlier CC BY-SA 2.1 Japan notice). Meshes were simplified and rigged for this project.
- **Motion capture:** The data used in this project was obtained from [mocap.cs.cmu.edu](http://mocap.cs.cmu.edu/). The database was created with funding from NSF EIA-0196217.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
