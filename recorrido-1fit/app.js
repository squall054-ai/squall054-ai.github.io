import { Viewer } from '@photo-sphere-viewer/core';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
import { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';
import { arrivalPosition } from './orientation.js';
import { directionalLink } from './navigation.js';
import { initFloorplan } from './floorplan.js';

const $ = (id) => document.getElementById(id);
const error = () => { $('error').hidden = false; };
try {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const response = await fetch('./scenes.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se encontró el catálogo');
  const scenes = await response.json();
  const nodes = scenes.map(s => ({
    id: s.id, name: s.name, caption: s.subtitle,
    data: { yaw: s.yaw },
    thumbnail: `panoramas/${s.id}/thumb.jpg`,
    panorama: { width: 8192, cols: 8, rows: 4, baseUrl: `panoramas/${s.id}/preview.jpg`, tileUrl: (col, row) => `panoramas/${s.id}/${col}_${row}.jpg` },
    links: s.links || [],
  }));
  const requestedId = new URLSearchParams(location.search).get('scene');
  const initial = scenes.find(s => s.id === requestedId) || scenes[0];
  const viewer = new Viewer({
    container: $('viewer'),
    adapter: [EquirectangularTilesAdapter, { baseBlur: false }],
    navbar: false, keyboard: false, defaultYaw: `${initial.yaw}deg`, defaultPitch: '0deg',
    defaultZoomLvl: 25, minFov: 35, maxFov: 100,
    loadingTxt: 'Entrando a 1Fit…',
    lang: { loadError: 'No se pudo cargar este panorama.', twoFingers: 'Usa dos dedos para mover la vista' },
    plugins: [[VirtualTourPlugin, {
      nodes, startNodeId: initial.id, positionMode: 'manual', renderMode: '2d', preload: false,
      transitionOptions: (node, fromNode, fromLink) => ({
        speed: 500, rotation: false, effect: reducedMotion.matches ? 'none' : 'fade',
        rotateTo: arrivalPosition(node, fromNode, fromLink),
      }),
      arrowStyle: {
        size: { width: 72, height: 48 },
        element: (link) => {
          const e = document.createElement('button');
          e.type = 'button';
          const door = link.data?.marker === 'puerta';
          e.className = `tour-arrow${door ? ' marker-door' : ''}`;
          e.setAttribute('aria-label', `${door ? 'Entrar a' : 'Avanzar a'} ${scenes.find(s => s.id === link.nodeId)?.name || 'la siguiente zona'}`);
          // Perspectiva solo en el dibujo: el visor controla la posición del botón.
          const arrow = door ? 'M22 32 H42 M34 24 L42 32 L34 40' : 'M22 36 L32 26 L42 36';
          e.innerHTML = `<svg class="floor-marker" viewBox="0 0 64 64" aria-hidden="true"><circle class="floor-ring" cx="32" cy="32" r="26"/><path class="floor-chevron" d="${arrow}"/></svg>`;
          // El botón gestiona el paso completo; evitar el salto directo del visor.
          for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchend']) {
            e.addEventListener(type, event => event.stopPropagation());
          }
          e.addEventListener('click', event => {
            event.stopPropagation();
            navigate(link.nodeId, link);
          });
          return e;
        },
      },
    }]],
  });
  const tour = viewer.getPlugin(VirtualTourPlugin);
  const floorplan = await initFloorplan(scenes, id => navigate(id));
  let moving = false;
  let hintTimer;
  function navigationHint(message) {
    clearTimeout(hintTimer);
    $('hint').textContent = message;
    $('hint').classList.remove('fade');
    hintTimer = setTimeout(() => $('hint').classList.add('fade'), 3500);
  }
  async function navigate(id, link = null, backwards = false) {
    if (moving || id === tour.getCurrentNode()?.id) return;
    moving = true;
    const zoom = viewer.getZoomLevel();
    try {
      let options;
      if (link) {
        const target = nodes.find(node => node.id === id);
        const arrival = arrivalPosition(target, tour.getCurrentNode(), link);
        if (backwards) arrival.yaw = `${parseFloat(arrival.yaw) + 180}deg`;
        if (!reducedMotion.matches) {
          await viewer.animate({
            yaw: backwards ? viewer.getPosition().yaw : link.position.yaw,
            pitch: 0,
            zoom: Math.max(0, Math.min(100, zoom + (backwards ? -8 : 10))),
            speed: 240,
          });
        }
        options = { rotateTo: arrival, zoomTo: zoom };
      }
      await tour.setCurrentNode(id, options, link);
    } catch (err) {
      viewer.zoom(zoom);
      console.error(err);
      error();
    } finally {
      moving = false;
    }
  }
  window.addEventListener('keydown', async event => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      || event.altKey || event.ctrlKey || event.metaKey
      || event.target.closest?.('input, textarea, select, [contenteditable="true"], dialog')
      || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    if (moving || event.repeat) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      moving = true;
      try {
        const { yaw: currentYaw, pitch } = viewer.getPosition();
        const yaw = currentYaw + (event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 8;
        if (reducedMotion.matches) viewer.rotate({ yaw, pitch });
        else await viewer.animate({ yaw, pitch, speed: 180 });
      } catch (err) {
        console.error(err);
        navigationHint('No se pudo girar la vista. Intenta de nuevo.');
      } finally { moving = false; }
      return;
    }
    const backwards = event.key === 'ArrowDown';
    const link = directionalLink(tour.getCurrentNode()?.links, viewer.getPosition().yaw, backwards);
    if (link) await navigate(link.nodeId, link, backwards);
    else navigationHint(backwards ? 'No hay un punto conectado detrás de ti.' : 'Mira hacia una flecha para avanzar.');
  });
  for (const [i, scene] of scenes.entries()) {
    const card = document.createElement('button'); card.className = 'scene-card'; card.dataset.id = scene.id;
    card.setAttribute('aria-label', `Visitar ${scene.name}`);
    const img = document.createElement('img'); img.src = `panoramas/${scene.id}/thumb.jpg`; img.alt = ''; img.decoding = 'async';
    const label = document.createElement('span'); label.className = 'card-text';
    const number = document.createElement('span'); number.className = 'card-number'; number.textContent = String(i+1).padStart(2, '0');
    const name = document.createElement('span'); name.textContent = scene.name;
    label.append(number, name); card.append(img, label);
    card.addEventListener('click', () => navigate(scene.id));
    $('scenes').append(card);
  }
  const gallery = $('scenes');
  function centerActiveCard(animate = true) {
    const card = gallery.querySelector('[aria-current="true"]');
    if (!card) return;
    const strip = gallery.getBoundingClientRect();
    const item = card.getBoundingClientRect();
    gallery.scrollTo({
      left: gallery.scrollLeft + item.left + item.width / 2 - strip.left - gallery.clientWidth / 2,
      behavior: animate && !reducedMotion.matches ? 'smooth' : 'instant',
    });
  }
  // Espacio en los extremos para centrar también la primera y última miniatura.
  new ResizeObserver(() => {
    const card = gallery.querySelector('.scene-card');
    if (!card) return;
    const style = getComputedStyle(gallery);
    const edge = (gallery.clientWidth - card.getBoundingClientRect().width) / 2
      - parseFloat(style.columnGap) - parseFloat(style.paddingLeft);
    gallery.style.setProperty('--gallery-edge', `${Math.max(0, edge)}px`);
    centerActiveCard(false);
  }).observe(gallery);
  gallery.addEventListener('wheel', (event) => {
    if (event.ctrlKey) return; // Conservar el gesto de zoom del navegador.
    event.preventDefault();
    event.stopPropagation();
    const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? gallery.clientWidth : 1;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    gallery.scrollBy({ left: delta * unit, behavior: 'instant' });
  }, { passive: false });
  function update(id) {
    floorplan.setActive(id);
    const scene = scenes.find(s => s.id === id);
    $('scene-name').textContent = scene.name; $('scene-subtitle').textContent = scene.subtitle;
    $('counter').textContent = `${String(scenes.indexOf(scene)+1).padStart(2,'0')} / ${String(scenes.length).padStart(2,'0')}`;
    document.querySelectorAll('.scene-card').forEach(card => card.setAttribute('aria-current', String(card.dataset.id === id)));
    centerActiveCard();
    const url = new URL(location.href); url.searchParams.set('scene', id); history.replaceState(null, '', url);
    $('error').hidden = true;
  }
  tour.addEventListener('node-changed', ({ node }) => update(node.id));
  update(initial.id);
  $('zoom-in').onclick = () => viewer.zoom(Math.min(100, viewer.getZoomLevel()+12));
  $('zoom-out').onclick = () => viewer.zoom(Math.max(0, viewer.getZoomLevel()-12));
  $('vr').onclick = () => {
    const url = new URL('./vr.html', location.href);
    url.searchParams.set('scene', tour.getCurrentNode()?.id || initial.id);
    url.searchParams.set('yaw', String(viewer.getPosition().yaw * 180 / Math.PI));
    location.href = url.href;
  };
  $('fullscreen').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('tour').requestFullscreen(); }
    catch { $('hint').textContent = 'Puedes ampliar la vista desde el menú de tu navegador.'; $('hint').classList.remove('fade'); }
  };
  $('help').onclick = () => $('instructions').showModal();
  function showPlan(visible) {
    $('plan-preview').hidden = !visible;
    $('toggle-plan').setAttribute('aria-expanded', String(visible));
    $('plan-toggle-label').textContent = visible ? 'Ocultar' : 'Mostrar';
  }
  showPlan(!matchMedia('(max-width: 600px), (max-height: 600px)').matches);
  $('toggle-plan').onclick = () => showPlan($('plan-preview').hidden);
  $('expand-plan').onclick = () => $('plan-dialog').showModal();
  $('close-plan').onclick = () => $('plan-dialog').close();
  $('plan-dialog').addEventListener('click', event => {
    if (event.target === $('plan-dialog')) {
      const rect = $('plan-dialog').getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('plan-dialog').close();
    }
  });
  $('close-help').onclick = $('got-it').onclick = () => $('instructions').close();
  setTimeout(() => $('hint').classList.add('fade'), 14000);
  viewer.addEventListener('panorama-error', error);
  // Ayuda local de autoría: centrar el punto donde irá una flecha y copiar sus ángulos.
  if (new URLSearchParams(location.search).get('editar') === '1') {
    document.body.classList.add('authoring');
    const crosshair = document.createElement('div'); crosshair.className = 'crosshair'; crosshair.textContent = '+';
    const panel = document.createElement('div'); panel.className = 'coordinate-panel';
    const label = document.createElement('label'); label.htmlFor = 'coordinates'; label.textContent = 'Centra la cruz donde irá la flecha y copia position:';
    const field = document.createElement('input'); field.id = 'coordinates'; field.readOnly = true; field.onclick = () => field.select();
    panel.append(label, field); $('tour').append(crosshair, panel);
    const updatePosition = () => { const p = viewer.getPosition(); field.value = JSON.stringify({ yaw: `${(p.yaw*180/Math.PI).toFixed(1)}deg`, pitch: `${(p.pitch*180/Math.PI).toFixed(1)}deg` }); };
    viewer.addEventListener('position-updated', updatePosition); updatePosition();
  }
} catch (err) { console.error(err); error(); }
