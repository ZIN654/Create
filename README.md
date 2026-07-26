# Inspector — 3D Model Viewer

A static, browser-based 3D asset inspection tool. Load a model, inspect its
geometry, materials and textures, switch render modes, and capture
screenshots — entirely client-side, no backend, no build step.

**Live demo:** open `index.html` directly, or serve the folder with any
static file server. It also deploys as-is to **GitHub Pages** (Settings →
Pages → deploy from branch, root folder).

## What's implemented (Phase 1)

- **Formats:** GLB, GLTF, OBJ, FBX, STL, PLY — dropped in via drag-and-drop
  or file picker, loaded with Three.js's official loaders.
- **File info panel:** filename, extension, size, load time, bounding box,
  dimensions, center.
- **Mesh statistics:** vertices, triangles, meshes, materials, textures,
  animations, bones, morph targets, draw calls, estimated texture memory
  and VRAM.
- **Material inspector:** per-material breakdown (base color, metalness,
  roughness, emissive, opacity, active texture slots).
- **Scene explorer:** hierarchy tree with per-node visibility toggles.
- **Lighting controls:** ambient, directional (key) intensity, tone-mapping
  exposure, background color.
- **Camera panel:** live position/FOV/near-far readout, reset, fit-to-model.
- **Render modes:** Shaded, Unlit, Wireframe, Normals, UV Checker (procedural
  checker texture), Matcap (procedural clay matcap) — no external assets
  required.
- **Scene tools:** grid, axis, auto-rotate, shadows.
- **Capture:** PNG screenshot download, fullscreen viewer.
- **Responsive layout:** tabbed Viewer / Inspect / Materials panels on
  narrow screens.
- **Keyboard shortcuts:** `F` frame model, `W` wireframe, `G` grid,
  `R` auto-rotate, `S` screenshot.
- Procedural **sample asset** button so the tool is demoable with no upload.

## Structure

```
model-viewer/
├── index.html
├── css/
│   └── main.css
├── js/
│   ├── main.js         entry point — wires DOM to viewer/loaders/inspector
│   ├── viewer.js        Three.js scene, renderer, camera, controls, render modes
│   ├── loaders.js       format detection + GLTF/OBJ/FBX/STL/PLY loading
│   └── inspector.js     statistics, material description, hierarchy builder
├── assets/
│   └── icons/
└── README.md
```

Three.js and its loader/control addons are loaded from a CDN (jsDelivr) via
an `importmap` in `index.html` — nothing to install, nothing to bundle.

## Not yet built (see original spec's Phase 2–5 roadmap)

Material/texture editing, mesh optimization and Draco/KTX2 compression,
model comparison, session sharing via URL state, WebXR AR/VR preview,
animation timeline, and a plugin system are intentionally out of scope for
this first pass — the module boundaries above (`loaders.js`, `viewer.js`,
`inspector.js`) are meant to make those additive rather than requiring a
rewrite.

## Browser support

Any browser with WebGL2 and ES modules (all current Chrome, Firefox,
Safari, Edge). No IE11 support.
