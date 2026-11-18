import * as THREE from 'three';
import { arrivalPosition } from './orientation.js';
import { loadConfig } from './configuracion.js';
import { qualitySource, supportsHighQuality } from './vr-quality.js';
import { markerPlacement } from './vr-markers.js';
import { createStickAction, directionalLink } from './vr-turn.js';

const status = document.getElementById('status');
const enter = document.getElementById('enter');
const back = document.getElementById('back');
const params = new URLSearchParams(location.search);
const rad = THREE.MathUtils.degToRad;
let renderer;

try {
  const config = await loadConfig();
  const response = await fetch('./scenes.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
  const nodes = await response.json();
  let current = nodes.find(n => n.id === params.get('scene')) || nodes.find(n => n.id === config.escenaInicial) || nodes[0];
  let busy = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
  camera.layers.enable(1);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const quality = document.getElementById('quality');
  const qualityNote = document.getElementById('quality-note');
  const viewMode = document.getElementById('view-mode');
  viewMode.querySelector('[value="stereo"]').disabled = !nodes.some(n => n.stereoTiles);
  const preferenceKey = `tour-vr-quality:${location.pathname}`;
  const highAvailable = supportsHighQuality(nodes, renderer.capabilities.maxTextureSize);
  quality.querySelector('[value="16k"]').disabled = !highAvailable;
  try { if (localStorage.getItem(preferenceKey) === '16k' && highAvailable) quality.value = '16k'; } catch {}
  const describeQuality = () => {
    quality.disabled = renderer.xr.isPresenting || viewMode.value === 'stereo';
    if (viewMode.value === 'stereo') {
      qualityNote.textContent = 'Estéreo: hasta 8K por ojo. Los puntos sin versión 3D usan mono hasta 8K. Consume más memoria que monoscópico.';
      return;
    }
    qualityNote.textContent = quality.value === '16k'
      ? 'Mayor consumo de memoria y descarga. Puede causar tirones o cerrar la pestaña. Los originales de menor resolución no se amplían.'
      : 'Menor consumo de memoria y descarga. Los originales de menor resolución se conservan.';
    if (!highAvailable) qualityNote.textContent += renderer.capabilities.maxTextureSize < 16384
      ? ' Este dispositivo no admite texturas de 16K.' : ' Este recorrido todavía no contiene originales superiores a 8K.';
  };
  quality.disabled = false; describeQuality();
  viewMode.addEventListener('change', describeQuality);
  quality.addEventListener('change', () => {
    describeQuality();
    try { localStorage.setItem(preferenceKey, quality.value); } catch {}
  });
  document.body.prepend(renderer.domElement);
  const world = new THREE.Group();
  scene.add(world);
  // Misma proyección y orientación de textura que Photo Sphere Viewer.
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(80, 96, 64, -Math.PI / 2).scale(-1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  world.add(sphere);
  sphere.layers.set(1);
  const rightSphere = new THREE.Mesh(sphere.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  rightSphere.layers.set(2);
  world.add(rightSphere);
  for (const mesh of [sphere, rightSphere]) {
    const position = new THREE.Vector3();
    mesh.frustumCulled = false;
    mesh.onBeforeRender = (_renderer, _scene, eyeCamera) => {
      position.setFromMatrixPosition(eyeCamera.matrixWorld);
      mesh.position.copy(world.worldToLocal(position));
      mesh.updateMatrixWorld(true);
    };
  }
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
      const placement = markerPlacement(link, config.alturaMarcadoresVR);
      const marker = new THREE.Mesh(new THREE.PlaneGeometry(placement.size, placement.size),
        new THREE.MeshBasicMaterial({ map: markerTexture(door), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      marker.position.set(placement.x, placement.y, placement.z);
      if (placement.floor) {
        marker.rotation.x = -Math.PI / 2;
        marker.rotateZ(Math.PI - placement.yaw);
      } else {
        // Puertas verticales: no inclinar el botón hacia la altura de los ojos.
        marker.lookAt(0, marker.position.y, 0);
      }
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
  function disposeTexture(texture) {
    texture?.dispose();
    if (texture?.image instanceof HTMLCanvasElement) texture.image.width = texture.image.height = 1;
  }
  function applyTexture(texture, right = texture) {
    const old = new Set([sphere.material.map, rightSphere.material.map]);
    sphere.material.map = texture; sphere.material.needsUpdate = true;
    rightSphere.material.map = right; rightSphere.material.needsUpdate = true;
    old.forEach(disposeTexture);
  }
  let qualityGeneration = 0;
  async function upgradeQuality(node) {
    const generation = ++qualityGeneration;
    const stereo = viewMode.value === 'stereo' && node.stereoTiles;
    const spec = stereo
      ? { ...node.stereoTiles, width: Math.min(node.stereoTiles.width, 8192, renderer.capabilities.maxTextureSize) }
      : qualitySource(node, viewMode.value === 'stereo' ? '8k' : quality.value, renderer.capabilities.maxTextureSize);
    const { cols, rows, width, directory } = spec;
    const loaded = [];
    let applied = false;
    try {
    for (const prefix of stereo ? ['left_', 'right_'] : ['']) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width / 2;
    const ctx = canvas.getContext('2d');
    let retained = false;
    try {
      if (!ctx) throw new Error('No hay memoria para crear la textura VR.');
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (generation !== qualityGeneration) return;
          const image = new Image();
          image.src = `panoramas/${node.id}/${directory}${prefix}${col}_${row}.jpg`;
          await image.decode();
          if (generation !== qualityGeneration) return;
          ctx.drawImage(image, col*width/cols, row*canvas.height/rows, width/cols, canvas.height/rows);
        }
      }
      if (generation === qualityGeneration && current.id === node.id) {
        loaded.push(textureOptions(new THREE.CanvasTexture(canvas))); retained = true;
      }
    } finally { if (!retained) canvas.width = canvas.height = 1; }
    }
    if (generation === qualityGeneration && current.id === node.id && loaded.length === (stereo ? 2 : 1)) {
      applyTexture(loaded[0], loaded[1] || loaded[0]); applied = true;
    }
    } catch (err) {
      console.warn('VR: se conserva la vista previa; no se pudieron cargar todos los mosaicos.', err);
      status.textContent = 'No se pudo cargar la calidad elegida. Prueba 8K o vuelve a intentarlo.';
    } finally { if (!applied) loaded.forEach(disposeTexture); }
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
      if (renderer.xr.isPresenting) void upgradeQuality(current);
    } catch (err) {
      console.error(err);
      status.textContent = 'No se pudo abrir ese panorama. Puedes volver a intentarlo.';
      await fadeTo(0);
    } finally { busy = false; }
  }
  const controllers = [0,1].map(index => {
    const controller = renderer.xr.getController(index);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),
      new THREE.LineBasicMaterial({ color: config.colorAcento }));
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
  const stickAction = createStickAction();
  renderer.setAnimationLoop(() => {
    const session = renderer.xr.getSession();
    // Rotar el entorno equivale al giro contrario de la cámara: positivo mira a la derecha.
    const action = stickAction(session?.inputSources, busy || !renderer.xr.isPresenting);
    if (action?.turn) world.rotation.y += action.turn;
    if (action?.travel) {
      renderer.xr.getCamera().getWorldDirection(direction);
      const link = directionalLink(current.links, direction, world.rotation.y, action.travel === 'backward');
      if (link) void travel(link);
    }
    const activeCamera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    activeCamera.getWorldPosition(eye);
    // Una foto 360 no tiene profundidad: conservar el centro de captura.
    world.position.copy(eye); curtain.position.copy(eye);
    scene.updateMatrixWorld(true);
    markers.children.forEach(m => m.material.color.setHex(busy ? 0xaaaaaa : 0xffffff));
    if (!busy && renderer.xr.isPresenting) for (const controller of controllers) {
      const hit = hitMarker(controller); if (hit) hit.object.material.color.set(config.colorAcento);
    }
    if (fade) {
      const progress = Math.min(1, (performance.now() - fade.start) / fade.duration);
      curtain.material.opacity = THREE.MathUtils.lerp(fade.from, fade.to, progress);
      if (progress === 1) { const resolve = fade.resolve; fade = null; resolve(); }
    }
    renderer.render(scene,camera);
  });
  // No descargar texturas grandes hasta que el usuario elija calidad y entre.
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight);
  });
  renderer.xr.addEventListener('sessionend', () => {
    qualityGeneration++;
    const stoppedGeneration = qualityGeneration;
    loader.loadAsync(`panoramas/${current.id}/preview.jpg`).then(texture => {
      if (qualityGeneration === stoppedGeneration && !renderer.xr.isPresenting) applyTexture(textureOptions(texture));
      else texture.dispose();
    }).catch(console.warn);
    viewMode.disabled = false;
    describeQuality();
    document.body.classList.remove('immersive'); enter.disabled = false;
    status.textContent = 'Sesión finalizada. Puedes volver a entrar o regresar al recorrido.';
  });
  if (!isSecureContext) status.textContent = 'Para entrar desde las gafas abre este recorrido mediante HTTPS.';
  else if (!navigator.xr || !await navigator.xr.isSessionSupported('immersive-vr')) status.textContent = 'Abre esta página en el navegador de Meta Quest u otras gafas compatibles con WebXR.';
  else { enter.disabled = false; status.textContent = 'Gafas compatibles detectadas. Pulsa Entrar en VR.'; }
  enter.addEventListener('click', async () => {
    enter.disabled = true;
    quality.disabled = true;
    viewMode.disabled = true;
    let session;
    try {
      session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      await renderer.xr.setSession(session);
      document.body.classList.add('immersive');
      void upgradeQuality(current);
    } catch (err) {
      await session?.end().catch(() => {});
      console.error(err); enter.disabled = false; quality.disabled = false;
      viewMode.disabled = false; describeQuality();
      status.textContent = 'No se pudo iniciar VR. Comprueba los permisos de las gafas e inténtalo de nuevo.';
    }
  });
} catch (err) {
  console.error(err); status.textContent = 'No se pudo preparar VR. Vuelve al recorrido e inténtalo de nuevo.';
  renderer?.setAnimationLoop(null);
}
