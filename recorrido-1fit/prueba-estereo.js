import * as THREE from 'three';
import { eyeOffsets } from './stereo-layout.js';

const status = document.getElementById('status');
const enter = document.getElementById('enter');
const mode = document.getElementById('stereo-mode');
let renderer;
try {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 100);
  camera.layers.enable(1); // Vista de escritorio: solamente el ojo izquierdo.
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.prepend(renderer.domElement);
  const source = await new THREE.TextureLoader().loadAsync('./stereo/p11-top-bottom.jpg');
  if (source.image.width !== source.image.height) throw new Error('Se esperaba una imagen estéreo superior/inferior cuadrada.');
  source.colorSpace = THREE.SRGBColorSpace;
  source.generateMipmaps = false;
  source.minFilter = THREE.LinearFilter;
  source.magFilter = THREE.LinearFilter;
  const textures = [source.clone(), source.clone()];
  const spheres = textures.map((texture, index) => {
    texture.repeat.set(1, 0.5); texture.needsUpdate = true;
    const geometry = new THREE.SphereGeometry(40, 96, 64, -Math.PI / 2).scale(-1, 1, 1);
    // Evitar que el filtrado mezcle una fila del ojo vecino en los polos.
    const uv = geometry.attributes.uv;
    const inset = 1 / source.image.height;
    for (let i=0; i<uv.count; i++) uv.setY(i, Math.max(inset, Math.min(1-inset, uv.getY(i))));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({map:texture,depthWrite:false}));
    mesh.layers.set(index + 1); // Three WebXR: capa 1 izquierda, capa 2 derecha.
    mesh.rotation.y = Math.PI;
    mesh.frustumCulled = false;
    // Cada esfera se centra en el ojo que la dibuja: sin añadir disparidad artificial.
    mesh.onBeforeRender = (_renderer, _scene, eyeCamera) => {
      mesh.position.setFromMatrixPosition(eyeCamera.matrixWorld);
      mesh.updateMatrixWorld(true);
    };
    scene.add(mesh);
    return mesh;
  });
  const updateMode = () => eyeOffsets(mode.value).forEach((offset, i) => textures[i].offset.set(0, offset));
  updateMode(); mode.addEventListener('change', updateMode);
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.xr.addEventListener('sessionend', () => {
    document.body.classList.remove('immersive');
    enter.disabled = false; mode.disabled = false;
    status.textContent = 'Elige otro modo para comparar y vuelve a entrar.';
  });
  if (!isSecureContext) status.textContent = 'Abre esta página mediante HTTPS en las gafas.';
  else if (!navigator.xr || !await navigator.xr.isSessionSupported('immersive-vr')) status.textContent = 'Abre el enlace en el navegador de las gafas compatible con WebXR.';
  else { enter.disabled = false; status.textContent = 'Panorama listo: 2048 × 1024 por ojo.'; }
  enter.addEventListener('click', async () => {
    enter.disabled = true; mode.disabled = true;
    let session;
    try {
      session = await navigator.xr.requestSession('immersive-vr');
      await renderer.xr.setSession(session);
      document.body.classList.add('immersive');
    } catch (err) {
      await session?.end().catch(() => {});
      enter.disabled = false; mode.disabled = false;
      status.textContent = 'No se pudo iniciar VR. Comprueba los permisos y vuelve a intentar.';
      console.error(err);
    }
  });
} catch (err) {
  console.error(err); renderer?.setAnimationLoop(null);
  status.textContent = 'No se pudo abrir la prueba. Comprueba que subiste también la carpeta stereo y los scripts.';
}
