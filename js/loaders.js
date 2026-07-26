import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

const EXT_MAP = {
  glb: 'gltf', gltf: 'gltf',
  obj: 'obj',
  fbx: 'fbx',
  stl: 'stl',
  ply: 'ply'
};

export function detectFormat(filename){
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_MAP[ext] || null;
}

/**
 * Loads a model from an ArrayBuffer/File and resolves to a THREE.Object3D,
 * always wrapped so downstream code can traverse consistently.
 */
export async function loadModel(file){
  const format = detectFormat(file.name);
  if (!format) throw new Error(`Unsupported file type: .${file.name.split('.').pop()}`);

  const url = URL.createObjectURL(file);
  try {
    switch(format){
      case 'gltf': return await loadGLTF(url);
      case 'obj':  return await loadOBJ(url);
      case 'fbx':  return await loadFBX(url);
      case 'stl':  return await loadSTL(url);
      case 'ply':  return await loadPLY(url);
    }
  } finally {
    // GLTFLoader may still need the url for lazy texture fetches in edge cases,
    // but for a single-file GLB / text formats this is safe to revoke shortly after.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

function normalizeMesh(mesh, defaultColor = 0x9aa6b3){
  if (!mesh.material){
    mesh.material = new THREE.MeshStandardMaterial({ color: defaultColor, roughness:0.6, metalness:0.05 });
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function loadGLTF(url){
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(url, gltf => {
      const root = gltf.scene || gltf.scenes[0];
      root.traverse(o => { if (o.isMesh) normalizeMesh(o); });
      root.userData.__animations = gltf.animations || [];
      resolve(root);
    }, undefined, err => reject(err));
  });
}

function loadOBJ(url){
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();
    loader.load(url, obj => {
      obj.traverse(o => { if (o.isMesh) normalizeMesh(o); });
      resolve(obj);
    }, undefined, err => reject(err));
  });
}

function loadFBX(url){
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(url, obj => {
      obj.traverse(o => { if (o.isMesh) normalizeMesh(o); });
      obj.userData.__animations = obj.animations || [];
      resolve(obj);
    }, undefined, err => reject(err));
  });
}

function loadSTL(url){
  return new Promise((resolve, reject) => {
    const loader = new STLLoader();
    loader.load(url, geometry => {
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color:0x9aa6b3, roughness:0.55, metalness:0.1 }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.add(mesh);
      resolve(group);
    }, undefined, err => reject(err));
  });
}

function loadPLY(url){
  return new Promise((resolve, reject) => {
    const loader = new PLYLoader();
    loader.load(url, geometry => {
      geometry.computeVertexNormals();
      const hasColor = !!geometry.getAttribute('color');
      const material = new THREE.MeshStandardMaterial({
        color: hasColor ? 0xffffff : 0x9aa6b3,
        vertexColors: hasColor,
        roughness:0.6, metalness:0.05
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.add(mesh);
      resolve(group);
    }, undefined, err => reject(err));
  });
}

/** Builds a small procedural sample model so the viewer is demoable with no file. */
export function buildSampleModel(){
  const group = new THREE.Group();
  group.name = 'SampleAsset';

  const body = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.65, 0.22, 180, 24),
    new THREE.MeshStandardMaterial({ color:0x4fd1c5, roughness:0.35, metalness:0.55, name:'KnotSurface' })
  );
  body.name = 'TorusKnot';
  body.position.y = 0.9;
  body.castShadow = true; body.receiveShadow = true;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.15, 48),
    new THREE.MeshStandardMaterial({ color:0x232a32, roughness:0.8, metalness:0.1, name:'BasePlate' })
  );
  base.name = 'BasePlate';
  base.position.y = 0.075;
  base.castShadow = true; base.receiveShadow = true;

  group.add(base, body);
  return group;
}
