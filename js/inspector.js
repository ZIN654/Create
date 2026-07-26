import * as THREE from 'three';

/** Walks the loaded object graph and computes aggregate mesh statistics. */
export function computeStatistics(root){
  const stats = {
    meshes:0, vertices:0, triangles:0, materials:0,
    textures:0, animations:0, bones:0, morphTargets:0,
    drawCalls:0, texMemoryBytes:0
  };
  const materialSet = new Set();
  const textureSet = new Set();

  root.traverse(obj => {
    if (obj.isMesh){
      stats.meshes++;
      stats.drawCalls++;
      const geom = obj.geometry;
      if (geom){
        const posAttr = geom.getAttribute('position');
        if (posAttr) stats.vertices += posAttr.count;
        if (geom.index) stats.triangles += geom.index.count / 3;
        else if (posAttr) stats.triangles += posAttr.count / 3;
        if (geom.morphAttributes && geom.morphAttributes.position){
          stats.morphTargets += geom.morphAttributes.position.length;
        }
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        if (!m) return;
        materialSet.add(m);
        Object.keys(m).forEach(k => {
          const v = m[k];
          if (v && v.isTexture){
            textureSet.add(v);
          }
        });
      });
    }
    if (obj.isBone) stats.bones++;
  });

  const animations = root.userData.__animations || [];
  stats.animations = animations.length;
  stats.materials = materialSet.size;
  stats.textures = textureSet.size;

  textureSet.forEach(tex => {
    const img = tex.image;
    if (img && img.width && img.height){
      // 4 bytes/px estimate, plus ~33% for mipmaps
      stats.texMemoryBytes += img.width * img.height * 4 * 1.33;
    }
  });

  stats.triangles = Math.round(stats.triangles);
  stats._materialSet = materialSet;
  stats._textureSet = textureSet;
  return stats;
}

export function estimateVRAM(stats){
  // rough heuristic: geometry (vertices * ~32 bytes attrs) + texture memory
  const geoBytes = stats.vertices * 32;
  return geoBytes + stats.texMemoryBytes;
}

export function formatBytes(bytes){
  if (!bytes || bytes < 1) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length-1){ bytes/=1024; i++; }
  return `${bytes.toFixed(bytes<10 && i>0 ? 2 : 0)} ${units[i]}`;
}

/** Returns a flat, de-duplicated list of materials found in the object graph. */
export function collectMaterials(root){
  const list = [];
  const seen = new Set();
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => {
      if (m && !seen.has(m.uuid)){
        seen.add(m.uuid);
        list.push(m);
      }
    });
  });
  return list;
}

const TEX_SLOTS = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','bumpMap','displacementMap'];

export function describeMaterial(m){
  const rows = [];
  rows.push(['Name', m.name || '(unnamed)']);
  rows.push(['Type', m.type]);
  if (m.color) rows.push(['Base color', '#' + m.color.getHexString()]);
  if ('metalness' in m) rows.push(['Metallic', m.metalness.toFixed(2)]);
  if ('roughness' in m) rows.push(['Roughness', m.roughness.toFixed(2)]);
  if ('emissive' in m) rows.push(['Emissive', '#' + m.emissive.getHexString()]);
  if ('opacity' in m) rows.push(['Opacity', m.opacity.toFixed(2)]);
  rows.push(['Transparent', m.transparent ? 'Yes' : 'No']);
  rows.push(['Double-sided', m.side === THREE.DoubleSide ? 'Yes' : (m.side === THREE.BackSide ? 'Back' : 'No')]);
  const activeSlots = TEX_SLOTS.filter(s => m[s]);
  rows.push(['Texture slots', activeSlots.length ? activeSlots.join(', ') : 'None']);
  return rows;
}

/** Builds a lightweight tree structure (for the scene explorer panel) from the object graph. */
export function buildTree(root){
  function walk(node){
    const kids = (node.children || [])
      .filter(c => !c.isLight && !c.isCamera && c.type !== 'GridHelper' && c.type !== 'AxesHelper')
      .map(walk);
    let kind = 'group';
    if (node.isMesh) kind = 'mesh';
    else if (node.isBone) kind = 'bone';
    return {
      id: node.uuid,
      name: node.name || node.type || '(node)',
      kind,
      visible: node.visible,
      ref: node,
      children: kids
    };
  }
  return walk(root);
}
