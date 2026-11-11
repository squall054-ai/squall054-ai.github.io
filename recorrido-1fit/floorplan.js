// Coordenadas en porcentaje del plano completo; no dependen del tamaño de pantalla.
export async function initFloorplan(scenes, navigate) {
  const $ = id => document.getElementById(id);
  const editing = new URLSearchParams(location.search).get('editarplano') === '1';
  const draftKey = `1fit-map-draft:${location.pathname}`;
  let active, dirty = false, points = {};
  function validPoints(data) {
    return Object.fromEntries(scenes.filter(s => {
      const p = data?.[s.id];
      return p && Number.isFinite(p.x) && Number.isFinite(p.y)
        && p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100;
    }).map(s => [s.id, { x: data[s.id].x, y: data[s.id].y }]));
  }
  try {
    const response = await fetch('./plano-puntos.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Plano sin coordenadas');
    points = validPoints(await response.json());
  } catch (err) { console.warn(err); }

  // El botón de ampliar y los puntos son hermanos, nunca botones anidados.
  const previewButton = $('expand-plan');
  const miniStage = document.createElement('div');
  miniStage.className = 'plan-stage plan-stage-mini';
  previewButton.before(miniStage);
  miniStage.append(previewButton);
  const fullImage = $('plan-dialog').querySelector('img');
  const fullStage = document.createElement('div');
  fullStage.className = 'plan-stage plan-stage-full';
  fullImage.before(fullStage);
  fullStage.append(fullImage);

  const editor = document.createElement('div');
  editor.className = 'plan-editor';
  editor.hidden = !editing;
  editor.innerHTML = '<label for="plan-scene">Panorama que vas a colocar</label><select id="plan-scene"></select><div class="plan-editor-actions"><button id="plan-visit" type="button">Ver panorama</button><button id="plan-remove" type="button">Quitar punto</button><button id="plan-restore" type="button">Recuperar borrador</button><button id="plan-export" type="button">Descargar puntos</button></div><p id="plan-status" role="status"></p>';
  fullStage.before(editor);
  const select = $('plan-scene');
  scenes.forEach(scene => {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = `${scene.file || scene.id} — ${scene.name}`;
    select.append(option);
  });
  function status(message = '') {
    $('plan-status').textContent = `${Object.keys(points).length} de ${scenes.length} puntos. ${message || 'Selecciona un panorama y haz clic en su ubicación sobre el plano.'}`;
  }
  function saveDraft() {
    dirty = true;
    try { localStorage.setItem(draftKey, JSON.stringify(points)); }
    catch { status('No se pudo guardar el borrador. Descarga los puntos antes de cerrar.'); }
  }
  function render() {
    for (const stage of [miniStage, fullStage]) {
      stage.querySelectorAll('.plan-point').forEach(el => el.remove());
      for (const scene of scenes) {
        const p = points[scene.id];
        if (!p) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'plan-point';
        button.style.left = `${p.x}%`;
        button.style.top = `${p.y}%`;
        button.textContent = scene.id.replace(/^p0?/, '');
        button.title = `${scene.file || scene.id} · ${scene.name}`;
        button.setAttribute('aria-label', `Visitar ${button.title}`);
        button.setAttribute('aria-current', String(scene.id === active));
        button.classList.toggle('point-selected', editing && scene.id === select.value);
        button.addEventListener('click', event => {
          event.stopPropagation();
          if (editing && stage === fullStage) {
            select.value = scene.id;
            render();
            status('Punto seleccionado. Haz clic en otra ubicación para moverlo.');
          } else {
            $('plan-dialog').close();
            navigate(scene.id);
          }
        });
        stage.append(button);
      }
    }
  }
  if (editing) {
    $('plan-title').textContent = 'Colocar puntos en el plano';
    fullStage.classList.add('plan-editing');
    fullStage.addEventListener('click', event => {
      if (event.target.closest('.plan-point')) return;
      const rect = fullImage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = 100 * (event.clientX - rect.left) / rect.width;
      const y = 100 * (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      points[select.value] = { x: +x.toFixed(2), y: +y.toFixed(2) };
      status('Ubicación registrada. Puedes elegir el siguiente panorama. Al terminar, descarga los puntos.');
      saveDraft(); render();
    });
    select.onchange = () => { render(); status(); };
    $('plan-visit').onclick = () => { $('plan-dialog').close(); navigate(select.value); };
    $('plan-remove').onclick = () => { delete points[select.value]; saveDraft(); render(); status('Punto eliminado.'); };
    $('plan-restore').onclick = () => {
      try {
        const saved = localStorage.getItem(draftKey);
        if (!saved) { status('No hay borrador guardado en este navegador.'); return; }
        points = validPoints(JSON.parse(saved));
        dirty = true; render(); status('Borrador recuperado.');
      } catch { status('No se pudo recuperar el borrador.'); }
    };
    $('plan-export').onclick = () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(points, null, 2) + '\n'], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'plano-puntos.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      dirty = false;
      status('Copia el archivo descargado a tour-web/dist/plano-puntos.json, reemplaza el anterior y recarga.');
    };
    window.addEventListener('beforeunload', event => {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    });
    status('El punto 02 es un ejemplo aproximado en recepción; puedes recolocarlo.');
  }
  render();
  return { setActive(id) { active = id; render(); } };
}
