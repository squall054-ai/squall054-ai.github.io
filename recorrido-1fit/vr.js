import * as THREE from 'three';
import { arrivalPosition } from './orientation.js';

const status = document.getElementById('status');
const enter = document.getElementById('enter');
const back = document.getElementById('back');
const params = new URLSearchParams(location.search);
const rad = THREE.MathUtils.degToRad;
let renderer;

try {
  const response = await fetch('./scenes.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
  const nodes = await response.json();
  let current = nodes.find(n => n.id === params.get('scene')) || nodes[0];
  let busy = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.prepend(renderer.domElement);
  const world = new THREE.Group();
  scene.add(world);
  // Misma proyección y orientación de textura que Photo Sphere Viewer.
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(80, 96, 64, -Math.PI / 2).scale(-1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  world.add(sphere);
  const markers = new THREE.Group();
  world.add(markers);
  const loader = new THREE.TextureLoader();
  const raycaster = new THREE.Raycaster();
  const matrix = new THREE.Matrix4();
  const eye = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const curtain = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  curtain.renderOrder = 100;
  scene.add(curtain);
  let fade = null;
  function fadeTo(value, duration = 140) {
    return new Promise(resolve => {
      fade = { start: performance.now(), from: curtain.material.opacity, to: value, duration, resolve };
    });
  }
  const textures = new Map();
  function markerTexture(door) {
    if (textures.has(door)) return textures.get(door);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111813aa'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(64, 64, 51, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.beginPath();
    if (door) { ctx.moveTo(43,64); ctx.lineTo(85,64); ctx.moveTo(69,48); ctx.lineTo(85,64); ctx.lineTo(69,80); }
    else { ctx.moveTo(43,74); ctx.lineTo(64,52); ctx.lineTo(85,74); }
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(door, texture); return texture;
  }
  function setMarkers() {
    for (const marker of [...markers.children]) { markers.remove(marker); marker.geometry.dispose(); marker.material.dispose(); }
    for (const link of current.links || []) {
      const door = link.data?.marker === 'puerta';
      const yaw = rad(parseFloat(link.position.yaw));
      const pitch = rad(parseFloat(link.position.pitch));
      const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.48,0.48),
        new THREE.MeshBasicMaterial({ map: markerTexture(door), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      marker.position.set(-Math.cos(pitch)*Math.sin(yaw), Math.sin(pitch), Math.cos(pitch)*Math.cos(yaw)).multiplyScalar(3);
      marker.lookAt(0,0,0);
      if (!door) marker.rotateX(-Math.PI / 3);
      marker.userData.link = link;
      markers.add(marker);
    }
  }
  function updateBackLink() { back.href = `./?scene=${encodeURIComponent(current.id)}`; }
  function textureOptions(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }
  function applyTexture(texture) { const old = sphere.material.map; sphere.material.map = texture; sphere.material.needsUpdate = true; old?.dispose(); }
  // Cargar únicamente el panorama activo. Reutilizar los mosaicos 8K existentes.
  let qualityGeneration = 0;
  async function upgradeQuality(node) {
    const generation = ++qualityGeneration;
    const width = Math.min(8192, renderer.capabilities.maxTextureSize);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width / 2;
    const ctx = canvas.getContext('2d');
    try {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 8; col++) {
          if (generation !== qualityGeneration) return;
          const image = new Image();
          image.src = `panoramas/${node.id}/${col}_${row}.jpg`;
          await image.decode();
          ctx.drawImage(image, col*width/8, row*width/8, width/8, width/8);
        }
      }
      if (generation === qualityGeneration && current.id === node.id) applyTexture(textureOptions(new THREE.CanvasTexture(canvas)));
    } catch (err) { console.warn('VR: se conserva la vista previa; no se pudieron cargar todos los mosaicos.', err); }
  }
  async function travel(link) {
    if (busy) return;
    const target = nodes.find(n => n.id === link.nodeId);
    if (!target) return;
    busy = true;
    try {
      const texture = textureOptions(await loader.loadAsync(`panoramas/${target.id}/preview.jpg`));
      await fadeTo(1);
      const arrival = arrivalPosition({ ...target, data: { yaw: target.yaw } }, current, link);
      renderer.xr.getCamera().getWorldDirection(direction);
      world.rotation.y = Math.atan2(direction.x, direction.z) + rad(parseFloat(arrival.yaw));
      qualityGeneration++;
      current = target;
      applyTexture(texture); setMarkers(); updateBackLink();
      await fadeTo(0);
      void upgradeQuality(current);
    } catch (err) {
      console.error(err);
      status.textContent = 'No se pudo abrir ese panorama. Puedes volver a intentarlo.';
      await fadeTo(0);
    } finally { busy = false; }
  }
  const controllers = [0,1].map(index => {
    const controller = renderer.xr.getController(index);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),
      new THREE.LineBasicMaterial({ color: 0xd8f449 }));
    beam.scale.z = 3; controller.add(beam); scene.add(controller);
    controller.addEventListener('select', () => {
      const hit = hitMarker(controller);
      if (hit) void travel(hit.object.userData.link);
    });
    return controller;
  });
  function hitMarker(controller) {
    matrix.extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0,0,-1).applyMatrix4(matrix);
    return raycaster.intersectObjects(markers.children, false)[0];
  }
  const initialYaw = Number(params.get('yaw') ?? current.yaw);
  world.rotation.y = Math.PI + rad(Number.isFinite(initialYaw) ? initialYaw : 0);
  applyTexture(textureOptions(await loader.loadAsync(`panoramas/${current.id}/preview.jpg`)));
  setMarkers(); updateBackLink();
  renderer.setAnimationLoop(() => {
    const activeCamera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    activeCamera.getWorldPosition(eye);
    // Una foto 360 no tiene profundidad: conservar el centro de captura.
    world.position.copy(eye); curtain.position.copy(eye);
    scene.updateMatrixWorld(true);
    markers.children.forEach(m => m.material.color.setHex(busy ? 0xaaaaaa : 0xffffff));
    if (!busy && renderer.xr.isPresenting) for (const controller of controllers) {
      const hit = hitMarker(controller); if (hit) hit.object.material.color.setHex(0xd8f449);
    }
    if (fade) {
      const progress = Math.min(1, (performance.now() - fade.start) / fade.duration);
      curtain.material.opacity = THREE.MathUtils.lerp(fade.from, fade.to, progress);
      if (progress === 1) { const resolve = fade.resolve; fade = null; resolve(); }
    }
    renderer.render(scene,camera);
  });
  void upgradeQuality(current);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight);
  });
  renderer.xr.addEventListener('sessionend', () => {
    document.body.classList.remove('immersive'); enter.disabled = false;
    status.textContent = 'Sesión finalizada. Puedes volver a entrar o regresar al recorrido.';
  });
  if (!isSecureContext) status.textContent = 'Para entrar desde las gafas abre este recorrido mediante HTTPS.';
  else if (!navigator.xr || !await navigator.xr.isSessionSupported('immersive-vr')) status.textContent = 'Abre esta página en el navegador de Meta Quest u otras gafas compatibles con WebXR.';
  else { enter.disabled = false; status.textContent = 'Gafas compatibles detectadas. Pulsa Entrar en VR.'; }
  enter.addEventListener('click', async () => {
    enter.disabled = true;
    let session;
    try {
      session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      await renderer.xr.setSession(session);
      document.body.classList.add('immersive');
    } catch (err) {
      await session?.end().catch(() => {});
      console.error(err); enter.disabled = false;
      status.textContent = 'No se pudo iniciar VR. Comprueba los permisos de las gafas e inténtalo de nuevo.';
    }
  });
} catch (err) {
  console.error(err); status.textContent = 'No se pudo preparar VR. Vuelve al recorrido e inténtalo de nuevo.';
  renderer?.setAnimationLoop(null);
}
