import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewer {
  constructor(canvas){
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.currentModel = null;
    this.autoRotate = false;
    this.renderMode = 'shaded';
    this._matcapTex = null;

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initControls();
    this._initLights();
    this._initHelpers();
    this._onResize();

    window.addEventListener('resize', () => this._onResize());
  }

  _initRenderer(){
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias:true, preserveDrawingBuffer:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
  }

  _initScene(){
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e11);
  }

  _initCamera(){
    const wrap = this.canvas.parentElement;
    const aspect = wrap.clientWidth / wrap.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.01, 2000);
    this.camera.position.set(2.5, 1.8, 3.2);
    this.defaultCamPos = this.camera.position.clone();
  }

  _initControls(){
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0,0.5,0);
  }

  _initLights(){
    this.ambient = new THREE.HemisphereLight(0xbfd9ff, 0x1a1410, 0.6);
    this.scene.add(this.ambient);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    this.keyLight.position.set(4, 6, 4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024,1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 30;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    this.fillLight.position.set(-4, 2, -3);
    this.scene.add(this.fillLight);
  }

  _initHelpers(){
    this.grid = new THREE.GridHelper(10, 20, 0x2c6b64, 0x1c2129);
    this.grid.position.y = 0;
    this.scene.add(this.grid);

    this.axes = new THREE.AxesHelper(1.2);
    this.scene.add(this.axes);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40,40),
      new THREE.ShadowMaterial({ opacity:0.25 })
    );
    this.ground.rotation.x = -Math.PI/2;
    this.ground.receiveShadow = true;
    this.ground.visible = false;
    this.scene.add(this.ground);
  }

  _onResize(){
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h,1);
    this.camera.updateProjectionMatrix();
  }

  setModel(object3d){
    this.clearModel();
    this.currentModel = object3d;
    this.scene.add(object3d);
  }

  clearModel(){
    if (this.currentModel){
      this.scene.remove(this.currentModel);
      this.currentModel.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material){
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => {
            Object.keys(m).forEach(k => { if (m[k] && m[k].isTexture) m[k].dispose(); });
            m.dispose();
          });
        }
      });
      this.currentModel = null;
    }
  }

  frameModel(object3d = this.currentModel){
    if (!object3d) return;
    const box = new THREE.Box3().setFromObject(object3d);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fitDist = maxDim / (2 * Math.tan((Math.PI * this.camera.fov) / 360));
    const dist = fitDist * 1.6;

    this.controls.target.copy(center);
    const dir = new THREE.Vector3(0.6, 0.45, 0.8).normalize();
    this.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    this.camera.near = Math.max(dist / 1000, 0.001);
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();

    this.defaultCamPos = this.camera.position.clone();
    this.defaultCamTarget = center.clone();

    this.grid.position.y = box.min.y;
    this.ground.position.y = box.min.y + 0.001;
  }

  resetCamera(){
    if (this.defaultCamPos){
      this.camera.position.copy(this.defaultCamPos);
      this.controls.target.copy(this.defaultCamTarget || new THREE.Vector3(0,0.5,0));
    } else {
      this.camera.position.set(2.5,1.8,3.2);
      this.controls.target.set(0,0.5,0);
    }
    this.controls.update();
  }

  setAmbient(v){ this.ambient.intensity = v; }
  setKeyIntensity(v){ this.keyLight.intensity = v; }
  setExposure(v){ this.renderer.toneMappingExposure = v; }
  setBackground(hex){ this.scene.background = new THREE.Color(hex); }
  setGridVisible(v){ this.grid.visible = v; }
  setAxisVisible(v){ this.axes.visible = v; }
  setShadowsVisible(v){
    this.ground.visible = v;
    this.keyLight.castShadow = v;
    this.renderer.shadowMap.enabled = v;
  }
  setAutoRotate(v){ this.autoRotate = v; }

  applyRenderMode(mode){
    this.renderMode = mode;
    if (!this.currentModel) return;
    this.currentModel.traverse(obj => {
      if (!obj.isMesh) return;
      if (!obj.userData.__originalMaterial){
        obj.userData.__originalMaterial = obj.material;
      }
      const orig = obj.userData.__originalMaterial;

      switch(mode){
        case 'shaded':
          obj.material = orig;
          break;
        case 'wireframe': {
          const m = new THREE.MeshBasicMaterial({ color:0x4fd1c5, wireframe:true });
          obj.material = m;
          break;
        }
        case 'unlit': {
          const src = Array.isArray(orig) ? orig[0] : orig;
          const m = new THREE.MeshBasicMaterial({
            color: src && src.color ? src.color : 0xcccccc,
            map: src ? src.map : null
          });
          obj.material = m;
          break;
        }
        case 'normal':
          obj.material = new THREE.MeshNormalMaterial();
          break;
        case 'uv': {
          if (!this._uvCheckerTex) this._uvCheckerTex = makeUVCheckerTexture();
          obj.material = new THREE.MeshBasicMaterial({ map: this._uvCheckerTex });
          break;
        }
        case 'matcap': {
          if (!this._matcapTex) this._matcapTex = makeMatcapTexture();
          obj.material = new THREE.MeshMatcapMaterial({ matcap: this._matcapTex });
          break;
        }
      }
    });
  }

  screenshot(){
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  render(){
    const dt = this.clock.getDelta();
    if (this.autoRotate && this.currentModel){
      this.currentModel.rotation.y += dt * 0.5;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  start(onFrame){
    const loop = () => {
      this.render();
      if (onFrame) onFrame();
      requestAnimationFrame(loop);
    };
    loop();
  }
}

/* Procedural UV checker texture — no external asset needed */
function makeUVCheckerTexture(){
  const size = 512, tiles = 8;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const step = size / tiles;
  for (let y=0;y<tiles;y++){
    for (let x=0;x<tiles;x++){
      ctx.fillStyle = (x+y)%2===0 ? '#1c8177' : '#e7ebef';
      ctx.fillRect(x*step, y*step, step, step);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Procedural matcap sphere texture — studio-lit clay look */
function makeMatcapTexture(){
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size*0.35, size*0.32, 8, size*0.5, size*0.5, size*0.62);
  grad.addColorStop(0, '#eef3f5');
  grad.addColorStop(0.45, '#8fa3ab');
  grad.addColorStop(0.75, '#3a4750');
  grad.addColorStop(1, '#151a1d');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,size,size);
  return new THREE.CanvasTexture(canvas);
}
