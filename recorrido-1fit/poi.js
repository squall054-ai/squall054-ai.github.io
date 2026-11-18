import { safeUrl, validatePoints, types } from './poi-data.js';

export async function initPoi(viewer, scenes, initialId) {
  const editing = new URLSearchParams(location.search).get('editarpoi') === '1';
  let points = [], current = initialId, dirty = false;
  const host = document.getElementById('tour');
  const layer = document.createElement('div'); layer.className = 'poi-layer'; host.append(layer);
  const dialog = document.createElement('dialog'); dialog.className = 'poi-dialog';
  dialog.setAttribute('aria-label', 'Punto de interés'); host.append(dialog);
  let pins = [];
  const el = (tag, text) => { const e = document.createElement(tag); if (text) e.textContent = text; return e; };
  function resetDialog(title) {
    dialog.replaceChildren();
    const close = el('button', 'Cerrar ×'); close.className = 'poi-close'; close.onclick = () => dialog.close();
    dialog.append(close, el('h2', title));
  }
  dialog.addEventListener('close', () => {
    dialog.querySelectorAll('audio,video').forEach(m => { m.pause(); m.removeAttribute('src'); m.load(); });
    dialog.replaceChildren();
  });
  function openPoint(p) {
    resetDialog(p.title);
    if (p.text) dialog.append(el('p', p.text));
    const url = safeUrl(p.url);
    if (p.type !== 'texto' && url) {
      if (p.type === 'audio' || p.type === 'video') {
        const media = el(p.type); media.controls = true; media.preload = 'none'; media.src = url;
        if (p.type === 'video') media.playsInline = true;
        media.addEventListener('error', () => dialog.append(el('p', 'No se pudo reproducir. Usa el enlace para abrir el contenido.')));
        dialog.append(media);
      } else if (p.type === 'pdf') {
        const frame = el('iframe'); frame.title = p.title; frame.src = url;
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        dialog.append(frame, el('p', 'Si el PDF no aparece, ábrelo con el enlace de abajo.'));
      }
      const a = el('a', 'Abrir contenido en otra pestaña ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; dialog.append(a);
    }
    dialog.showModal();
  }
  function positionPins() {
    const look = viewer.getPosition();
    for (const {button, p} of pins) {
      const yaw = p.yaw*Math.PI/180, pitch = p.pitch*Math.PI/180;
      const dot = Math.sin(pitch)*Math.sin(look.pitch) + Math.cos(pitch)*Math.cos(look.pitch)*Math.cos(yaw-look.yaw);
      const pos = viewer.dataHelper.sphericalCoordsToViewerCoords({yaw,pitch});
      button.hidden = dot <= 0 || pos.x < 0 || pos.y < 0 || pos.x > layer.clientWidth || pos.y > layer.clientHeight;
      button.style.left = pos.x+'px'; button.style.top = pos.y+'px';
    }
  }
  function draw() {
    layer.replaceChildren(); pins = [];
    for (const p of points.filter(p => p.scene === current)) {
      const button = el('button', {texto:'i',audio:'♫',video:'▶',pdf:'PDF',enlace:'↗'}[p.type]);
      button.className = 'poi-pin'; button.title = p.title; button.setAttribute('aria-label', p.title);
      button.onclick = () => openPoint(p); layer.append(button); pins.push({button,p});
    }
    positionPins();
  }
  viewer.addEventListener('render', positionPins);
  function exportPoints() {
    const blob = new Blob([JSON.stringify(points,null,2)+'\n'], {type:'application/json'});
    const url = URL.createObjectURL(blob), a = el('a'); a.href=url; a.download='puntos-interes.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    dirty = false;
  }
  function editor(existing = null) {
    resetDialog(existing ? 'Editar punto' : 'Crear punto en el centro de la vista');
    const look = viewer.getPosition();
    const form = el('form');
    const field = (label, tag, value) => { const l=el('label',label), input=el(tag); l.append(input); form.append(l); if(value !== undefined) input.value=value; return input; };
    const title=field('Título','input',existing?.title || ''); title.required=true;
    const type=field('Contenido','select');
    for(const t of types) { const o=el('option',t); o.value=t; type.append(o); } type.value=existing?.type || 'texto';
    const text=field('Texto o descripción','textarea',existing?.text || '');
    const url=field('Archivo local (contenido/archivo.pdf) o URL completa','input',existing?.url || '');
    const yaw=field('Yaw en grados','input',existing?.yaw ?? +(look.yaw*180/Math.PI).toFixed(1));
    const pitch=field('Pitch en grados','input',existing?.pitch ?? +(look.pitch*180/Math.PI).toFixed(1));
    for(const f of [yaw,pitch]) { f.type='number'; f.step='any'; f.required=true; }
    pitch.min='-90';pitch.max='90';
    const error=el('p'); error.className='poi-error';
    const save=el('button','Guardar punto'); save.type='submit';form.append(error,save);dialog.append(form);
    form.onsubmit=e=>{
      e.preventDefault();
      const p={id:existing?.id || crypto.randomUUID(),scene:existing?.scene || current,type:type.value,title:title.value.trim(),text:text.value,url:url.value.trim(),yaw:Number(yaw.value),pitch:Number(pitch.value)};
      try { validatePoints([p],scenes.map(s=>s.id),location.href); }
      catch(err) {error.textContent=err.message;return;}
      points=points.filter(item=>item.id!==p.id);points.push(p);dirty=true;draw();manager();
    };
    if(!dialog.open) dialog.showModal();
  }
  function manager() {
    resetDialog('Puntos de interés · '+current);
    dialog.append(el('p','Centra la vista donde irá el punto y pulsa Crear. Descarga el JSON y reemplaza dist/puntos-interes.json para conservar y publicar los cambios.'));
    const actions=el('div');actions.className='poi-actions';
    const add=el('button','Crear en el centro');add.onclick=()=>editor();
    const download=el('button','Descargar JSON');download.onclick=exportPoints;
    actions.append(add,download);dialog.append(actions);
    for(const p of points.filter(p=>p.scene===current)) {
      const row=el('div');row.className='poi-item';const edit=el('button',p.title);edit.onclick=()=>editor(p);
      const del=el('button','Eliminar');del.onclick=()=>{if(confirm('¿Eliminar '+p.title+'?')){points=points.filter(item=>item!==p);dirty=true;draw();manager();}};
      row.append(edit,del);dialog.append(row);
    }
    if(!dialog.open)dialog.showModal();
  }
  try {
    const response=await fetch('./puntos-interes.json',{cache:'no-store'});
    if(!response.ok)throw new Error('No se pudo cargar puntos-interes.json ('+response.status+').');
    points=validatePoints(await response.json(),scenes.map(s=>s.id),location.href);
    if(editing) {
      const button=el('button','Editar puntos de interés');button.className='poi-editor-button';button.onclick=manager;host.append(button);
      const cross=el('div','+');cross.className='poi-crosshair';host.append(cross);
      window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
    }
  } catch(err) {
    console.error('Puntos de interés:',err);
    if(editing) {resetDialog('No se cargaron los puntos');dialog.append(el('p',err.message+' Corrige el archivo antes de editar para evitar perder puntos existentes.'));dialog.showModal();}
  }
  draw();
  return {setActive(id){current=id;if(dialog.open)dialog.close();draw();}};
}
