# Pose Capture Tool

Generates the exercise figures in `src/components/StretchAnimation.tsx` from real
video, so the stick-figure poses are anatomically correct by construction.

Instead of drawing poses by hand, you film yourself (or a partner) holding each
stretch. The tool runs **MediaPipe PoseLandmarker** (BlazePose — the successor to
the [TensorFlow MoveNet/BlazePose blog model](https://blog.tensorflow.org/2018/05/real-time-human-pose-estimation-in.html))
in the browser, extracts the 33-point body skeleton, and a script converts the
joints into the SVG coordinates the app renders.

## Pipeline

```
Film a clip per exercise (5–10 s, hold the pose)
        |
        v
pose-tool.html  (browser, MediaPipe PoseLandmarker)
  samples 15 frames -> detects 33 joints -> averages (visibility-weighted)
        |
        v
src/data/poses/<animation-id>.json   (exported per exercise)
        |
        v
node scripts/pose-to-figures.mjs
  picks the visible side of each joint pair, flips to face-right when needed,
  auto-scales to the 200x140 viewBox (centered, lowest point on the floor line)
        |
        v
<Limb>/<Head> snippets -> pasted into a figure component in StretchAnimation.tsx
```

## Prerequisites

- `npm install` (the tool uses `@mediapipe/tasks-vision`)
- Internet access: the first capture downloads the pose model (~12 MB) from
  Google's storage. The WASM runtime is served locally by the Vite dev server
  and falls back to a CDN if that fails.

## Usage

### 1. Film the clips

One clip per animation id (10 total):

`seated-shin`, `wall-calf`, `soleus`, `upward-salute`, `toe-touch`, `lunge`,
`upward-dog`, `childs-pose`, `downward-dog`, `wide-leg-bend`

Tips for good detection:

- Phone on a tripod at a fixed position, full body in frame with some margin
- **Side view** (profile) matches the figure convention; front view works too
- Hold the pose **still for 5–10 seconds** — the tool samples the middle 60%
- Bright, even lighting; plain background; no other people in frame
- For wall poses (`wall-calf`, `soleus`), the wall is not needed — just hold
  the pose as if the wall were there

### 2. Capture

1. `npm run dev`
2. Open `http://localhost:5173/pose-tool.html`
3. Pick the video, type the animation id, click **Capture**
4. Check the skeleton overlay (cyan lines / pink dots) — joints should land on
   the body and the figure should look like the pose
5. **Download JSON** and save it as `src/data/poses/<animation-id>.json`

Repeat per exercise.

### 3. Generate

```sh
node scripts/pose-to-figures.mjs
```

Prints one block per capture:

```
=== downward-dog (downward-dog.json, 15 frames, flipped) ===
      <Limb x1={148} y1={124} x2={138} y2={84} /> // upper arm
      ...
      <Head cx={130} cy={76} />
```

- `flipped` means the clip was filmed facing left and was mirrored so the
  figure faces right (the app convention)
- Warnings list joints that were low-visibility and got skipped — if a whole
  segment is missing (e.g. no wrist), re-shoot that clip

### 4. Integrate

Replace the static geometry inside the matching figure component in
`src/components/StretchAnimation.tsx` (e.g. `DownwardDog` for `downward-dog`).
Keep:

- The floor/scene lines (`SCENE` lines)
- The `motion.g` breathing animation — wrap the generated torso/head/arms (or
  whole body) segments in it, using the same small-amplitude `y`/`x` keyframes
  the component already uses
- The `Pulse` marker on the stretched muscle (reposition to the new geometry)
- The side-view mirroring is handled by the parent `StretchAnimation` for
  `side: "right"` stretches

Then run `npm run test:run` and `npx tsc -b`.

## How the generator works (`scripts/pose-to-figures.mjs`)

For each capture:

1. **Side selection** — each joint pair (left/right shoulder, elbow, wrist,
   hip, knee, ankle, heel, foot) resolves to whichever side has higher
   visibility; that is the side facing the camera.
2. **Facing** — if the nose is behind the shoulder/hip line, the person faces
   left and all x-coordinates are mirrored.
3. **Projection** — the joints are scaled to fit `x: 14–186` and
   `y: 18–126` in the 200x140 viewBox (top band reserved for the head circle),
   centered horizontally, with the lowest point on the floor line `y=126`.
4. **Segments** — torso (shoulder→hip), upper arm (shoulder→elbow), forearm
   (elbow→wrist), thigh (hip→knee), shin (knee→ankle), foot (heel→foot index,
   falling back to ankle→foot index), head (midpoint of nose and ear).
5. Joints with visibility ≤ 0.5 are skipped.

## Troubleshooting

- **"No person detected"** — brighter clip, full body in frame, no obstructions,
  no second person
- **Model download fails** — the tool falls back from the local WASM to a CDN;
  the model itself needs internet on first capture
- **GPU delegate error** — the tool automatically retries with the CPU delegate
- **Skeleton overlay looks wrong** — the pose was probably not held still
  enough, or the camera clipped part of the body; re-shoot
- **A segment is missing in the output** — that joint was occluded/low
  visibility in the clip; re-shoot with the body less crossed over itself

## Files

| File | Purpose |
| --- | --- |
| `pose-tool.html` | Standalone capture page (dev only, not part of the app bundle) |
| `scripts/pose-to-figures.mjs` | JSON → SVG coordinate generator |
| `src/data/poses/` | One JSON capture per animation id |
| `src/components/StretchAnimation.tsx` | Where the generated geometry lives |
