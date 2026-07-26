import * as THREE from 'three';
import { Viewer } from './viewer.js';
import { loadModel, buildSampleModel } from './loaders.js';
import { computeStatistics, estimateVRAM, formatBytes, collectMaterials, describeMaterial, buildTree } from './inspector.js';

/* ---------- element refs ---------- */
const $ = sel => document.querySelector(sel);

const canvas = $('#viewerCanvas');
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const viewerEmpty = $('#viewerEmpty');
const statusDot = $('#statusDot');
const statusText = $('#statusText');
const toast = $('#toast');
const fpsValue = $('#fpsValue');
const modeReadout = $('#modeReadout');

const fileInfoBlock = $('#fileInfoBlock');
const fileInfoList = $('#fileInfoList');
const statsBlock = $('#statsBlock');
const statsList = $('#statsList');
const hierarchyBlock = $('#hierarchyBlock');
const sceneTree = $('#sceneTree');
const materialSelect = $('#materialSelect');
const materialProps = $('#materialProps');
const cameraProps = $('#cameraProps');
const btnClear = $('#btnClear');
const btnSample = $('#btnSample');

/* ---------- viewer ---------- */
const viewer = new Viewer(canvas);
let currentMaterials = [];
let currentFileMeta = null;
let selectedTreeId = null;

/* ---------- helpers ---------- */
function showToast(msg, isError=false){
  toast.textContent = msg;
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--line)';
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2400);
}

function kv(dt, dd){
  const t = document.createElement('dt'); t.textContent = dt;
  const d = document.createElement('dd'); d.textContent = dd; d.title = dd;
  return [t, d];
}
function renderKV(container, pairs){
  container.innerHTML = '';
  pairs.forEach(([dt,dd]) => { const [t,d] = kv(dt,dd); container.append(t,d); });
}

/* ---------- model loading pipeline ---------- */
async function handleFile(file){
  if (!file) return;
  statusText.textContent = 'Loading…';
  statusDot.classList.remove('live');
  try {
    const t0 = performance.now();
    const object = await loadModel(file);
    const loadMs = (performance.now() - t0).toFixed(0);

    viewer.setModel(object);
    viewer.frameModel(object);
    viewer.applyRenderMode(document.querySelector('#renderModes .chip.active')?.dataset.mode || 'shaded');

    currentFileMeta = {
      name: file.name,
      ext: file.name.split('.').pop().toUpperCase(),
      sizeBytes: file.size,
      loadMs
    };
    onModelReady(object);
    showToast(`Loaded ${file.name} in ${loadMs} ms`);
  } catch (err){
    console.error(err);
    showToast(`Failed to load model: ${err.message || err}`, true);
    statusText.textContent = 'Load failed';
  }
}

function onModelReady(object){
  viewerEmpty.hidden = true;
  statusDot.classList.add('live');
  statusText.textContent = currentFileMeta ? currentFileMeta.name : 'Model loaded';
  btnClear.disabled = false;

  updateFileInfoPanel(object);
  updateStatsPanel(object);
  updateMaterialsPanel(object);
  updateHierarchyPanel(object);
}

function updateFileInfoPanel(object){
  const box = computeBox3(object);
  fileInfoBlock.hidden = false;
  const pairs = [];
  if (currentFileMeta){
    pairs.push(['Filename', currentFileMeta.name]);
    pairs.push(['Extension', currentFileMeta.ext]);
    pairs.push(['File size', formatBytes(currentFileMeta.sizeBytes)]);
    pairs.push(['Load time', `${currentFileMeta.loadMs} ms`]);
  } else {
    pairs.push(['Filename', 'sample-asset (procedural)']);
  }
  pairs.push(['Dimensions', `${box.size.x.toFixed(2)} × ${box.size.y.toFixed(2)} × ${box.size.z.toFixed(2)}`]);
  pairs.push(['Bounding box min', `${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}`]);
  pairs.push(['Bounding box max', `${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)}`]);
  pairs.push(['Center', `${box.center.x.toFixed(2)}, ${box.center.y.toFixed(2)}, ${box.center.z.toFixed(2)}`]);
  renderKV(fileInfoList, pairs);
}

// bounding-box helper — returns plain-number fields so callers stay simple
function computeBox3(object){
  const box = new THREE.Box3().setFromObject(object);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  return {
    min: box.isEmpty() ? new THREE.Vector3() : box.min,
    max: box.isEmpty() ? new THREE.Vector3() : box.max,
    size, center
  };
}

function updateStatsPanel(object){
  const stats = computeStatistics(object);
  const vram = estimateVRAM(stats);
  statsBlock.hidden = false;
  renderKV(statsList, [
    ['Meshes', stats.meshes],
    ['Vertices', stats.vertices.toLocaleString()],
    ['Triangles', stats.triangles.toLocaleString()],
    ['Materials', stats.materials],
    ['Textures', stats.textures],
    ['Animations', stats.animations],
    ['Bones', stats.bones],
    ['Morph targets', stats.morphTargets],
    ['Draw calls', stats.drawCalls],
    ['Texture memory', formatBytes(stats.texMemoryBytes)],
    ['Est. VRAM', formatBytes(vram)],
  ]);
}

function updateMaterialsPanel(object){
  currentMaterials = collectMaterials(object);
  materialSelect.innerHTML = '';
  if (currentMaterials.length === 0){
    materialSelect.innerHTML = '<option>No materials</option>';
    materialProps.innerHTML = '';
    return;
  }
  currentMaterials.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m.name || `${m.type} #${i+1}`;
    materialSelect.appendChild(opt);
  });
  materialSelect.selectedIndex = 0;
  renderKV(materialProps, describeMaterial(currentMaterials[0]));
}

materialSelect.addEventListener('change', () => {
  const m = currentMaterials[materialSelect.value];
  if (m) renderKV(materialProps, describeMaterial(m));
});

function updateHierarchyPanel(object){
  hierarchyBlock.hidden = false;
  const tree = buildTree(object);
  sceneTree.innerHTML = '';
  selectedTreeId = null;
  renderTreeNode(tree, sceneTree, 0);
}

function renderTreeNode(node, container, depth){
  const row = document.createElement('div');
  row.className = 'tree-row';
  row.style.paddingLeft = `${depth*14 + 4}px`;
  const icon = node.kind === 'mesh' ? '▣' : node.kind === 'bone' ? '◇' : '▸';
  row.innerHTML = `<span class="tree-icon">${icon}</span><span class="tree-name">${escapeHtml(node.name)}</span>`;

  const visBtn = document.createElement('span');
  visBtn.className = 'tree-vis';
  visBtn.textContent = node.ref.visible ? '●' : '○';
  visBtn.title = 'Toggle visibility';
  visBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    node.ref.visible = !node.ref.visible;
    visBtn.textContent = node.ref.visible ? '●' : '○';
  });
  row.appendChild(visBtn);

  row.addEventListener('click', () => {
    document.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
  });

  container.appendChild(row);
  node.children.forEach(child => renderTreeNode(child, container, depth+1));
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function clearScene(){
  viewer.clearModel();
  viewerEmpty.hidden = false;
  statusDot.classList.remove('live');
  statusText.textContent = 'No model loaded';
  btnClear.disabled = true;
  fileInfoBlock.hidden = true;
  statsBlock.hidden = true;
  hierarchyBlock.hidden = true;
  materialSelect.innerHTML = '<option>No materials</option>';
  materialProps.innerHTML = '';
  currentFileMeta = null;
}

/* ---------- upload wiring ---------- */
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

['dragenter','dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave','drop'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
// allow dropping anywhere on the viewer too
const viewerWrap = $('#viewerWrap');
['dragenter','dragover'].forEach(evt => viewerWrap.addEventListener(evt, e => e.preventDefault()));
viewerWrap.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

btnSample.addEventListener('click', () => {
  const object = buildSampleModel();
  viewer.setModel(object);
  viewer.frameModel(object);
  viewer.applyRenderMode(document.querySelector('#renderModes .chip.active')?.dataset.mode || 'shaded');
  currentFileMeta = null;
  onModelReady(object);
  showToast('Loaded procedural sample asset');
});

btnClear.addEventListener('click', clearScene);

/* ---------- render mode chips ---------- */
document.querySelectorAll('#renderModes .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#renderModes .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    viewer.applyRenderMode(chip.dataset.mode);
    modeReadout.textContent = chip.textContent.toUpperCase();
  });
});

/* ---------- scene tool chips ---------- */
document.querySelectorAll('#sceneTools .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const tool = chip.dataset.tool;
    const active = !chip.classList.contains('active');
    chip.classList.toggle('active');
    if (tool === 'grid') viewer.setGridVisible(active);
    if (tool === 'axis') viewer.setAxisVisible(active);
    if (tool === 'rotate') viewer.setAutoRotate(active);
    if (tool === 'shadows') viewer.setShadowsVisible(active);
  });
});

/* ---------- capture ---------- */
$('#btnScreenshot').addEventListener('click', () => {
  const dataUrl = viewer.screenshot();
  const a = document.createElement('a');
  const name = (currentFileMeta?.name || 'model').replace(/\.[^.]+$/, '');
  a.href = dataUrl;
  a.download = `${name}-screenshot.png`;
  a.click();
  showToast('Screenshot saved');
});

$('#btnFullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) viewerWrap.requestFullscreen?.();
  else document.exitFullscreen?.();
});

/* ---------- lighting panel ---------- */
const ambientIntensity = $('#ambientIntensity'), ambientVal = $('#ambientVal');
const keyIntensity = $('#keyIntensity'), keyVal = $('#keyVal');
const exposure = $('#exposure'), exposureVal = $('#exposureVal');
const bgColor = $('#bgColor');

ambientIntensity.addEventListener('input', () => {
  viewer.setAmbient(+ambientIntensity.value);
  ambientVal.textContent = (+ambientIntensity.value).toFixed(2);
});
keyIntensity.addEventListener('input', () => {
  viewer.setKeyIntensity(+keyIntensity.value);
  keyVal.textContent = (+keyIntensity.value).toFixed(2);
});
exposure.addEventListener('input', () => {
  viewer.setExposure(+exposure.value);
  exposureVal.textContent = (+exposure.value).toFixed(2);
});
bgColor.addEventListener('input', () => viewer.setBackground(bgColor.value));

/* ---------- camera panel ---------- */
$('#btnResetCam').addEventListener('click', () => viewer.resetCamera());
$('#btnFitCam').addEventListener('click', () => viewer.frameModel());

function refreshCameraPanel(){
  const c = viewer.camera;
  renderKV(cameraProps, [
    ['Position', `${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)}`],
    ['FOV', `${c.fov.toFixed(0)}°`],
    ['Near / Far', `${c.near.toFixed(2)} / ${c.far.toFixed(0)}`],
    ['Aspect', c.aspect.toFixed(2)],
  ]);
}

/* ---------- fps + camera readout loop ---------- */
let frames = 0, lastFpsTime = performance.now();
viewer.start(() => {
  frames++;
  const now = performance.now();
  if (now - lastFpsTime >= 500){
    fpsValue.textContent = Math.round((frames * 1000) / (now - lastFpsTime));
    frames = 0; lastFpsTime = now;
    refreshCameraPanel();
  }
});

/* ---------- theme toggle ---------- */
$('#btnTheme').addEventListener('click', () => {
  const root = document.documentElement;
  const isLight = root.getAttribute('data-theme') === 'light';
  root.setAttribute('data-theme', isLight ? 'dark' : 'light');
});

/* ---------- help modal ---------- */
const modalBackdrop = $('#modalBackdrop');
$('#btnHelp').addEventListener('click', () => modalBackdrop.hidden = false);
$('#btnCloseModal').addEventListener('click', () => modalBackdrop.hidden = true);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) modalBackdrop.hidden = true; });

/* ---------- keyboard shortcuts ---------- */
window.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  switch(e.key.toLowerCase()){
    case 'f': viewer.frameModel(); break;
    case 'w': document.querySelector('[data-mode="wireframe"]').click(); break;
    case 'g': document.querySelector('[data-tool="grid"]').click(); break;
    case 'r': document.querySelector('[data-tool="rotate"]').click(); break;
    case 's': $('#btnScreenshot').click(); break;
  }
});

/* ---------- mobile tab switching ---------- */
const layoutEl = $('.layout');
document.querySelectorAll('.mtab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    layoutEl.dataset.active = tab.dataset.panel;
  });
});
layoutEl.dataset.active = 'viewer';

/* ---------- initial state ---------- */
statusText.textContent = 'No model loaded';
