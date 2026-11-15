const defaults = {
  nombre: 'Recorrido', marcaInicio: '', marcaResto: 'Recorrido', marcaSimbolo: '', logo: '',
  titulo: 'Recorrido virtual', descripcion: 'Explora el espacio en 360 grados.',
  encabezado: 'DESCUBRE EL ESPACIO', galeria: 'EXPLORA', cargando: 'Cargando recorrido…',
  colorAcento: '#d8f449', colorFondo: '#111813', mostrarVR: true, mostrarPlano: true,
  imagenPlano: 'assets/plano-1fit.jpg', tituloPlano: 'Plano', escenaInicial: '',
  alturaMarcadoresVR: 1.65,
};
export function normalizeConfig(input) {
  const config = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (typeof input?.[key] === typeof defaults[key]) config[key] = input[key];
  }
  for (const key of ['colorAcento', 'colorFondo']) {
    if (!/^#[0-9a-f]{6}$/i.test(config[key])) config[key] = defaults[key];
  }
  if (!Number.isFinite(config.alturaMarcadoresVR) || config.alturaMarcadoresVR < 1 || config.alturaMarcadoresVR > 2.2) config.alturaMarcadoresVR = defaults.alturaMarcadoresVR;
  // Imágenes del propio proyecto o HTTPS. No se interpreta HTML del archivo.
  for (const key of ['logo', 'imagenPlano']) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(config[key]) && !/^https:\/\//i.test(config[key])) config[key] = defaults[key];
  }
  return config;
}
export async function loadConfig() {
  let input = {};
  try {
    const response = await fetch('./configuracion.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se encontró configuracion.json');
    input = await response.json();
  } catch (err) { console.warn('Se usará la configuración genérica.', err); }
  const c = normalizeConfig(input);
  const text = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value; };
  document.title = document.getElementById('enter') ? `${c.nombre} · Realidad virtual` : c.titulo;
  document.querySelector('meta[name="description"]')?.setAttribute('content', c.descripcion);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.colorFondo);
  document.documentElement.style.setProperty('--lime', c.colorAcento);
  document.documentElement.style.setProperty('--ink', c.colorFondo);
  document.getElementById('tour')?.setAttribute('aria-label', `Recorrido virtual de ${c.nombre}`);
  const brand = document.querySelector('.brand');
  if (brand) {
    brand.replaceChildren();
    brand.setAttribute('aria-label', `${c.nombre}, inicio`);
    brand.classList.toggle('brand-custom', !c.marcaInicio);
    if (c.logo) {
      const img = document.createElement('img'); img.src = c.logo; img.alt = c.nombre;
      img.onerror = () => { brand.textContent = c.nombre; };
      brand.append(img);
    } else {
      const start = document.createElement('span'); start.textContent = c.marcaInicio;
      const symbol = document.createElement('span'); symbol.className = 'brand-dot'; symbol.textContent = c.marcaSimbolo;
      brand.append(start, document.createTextNode(c.marcaResto || c.nombre), symbol);
    }
  }
  // Favicon genérico: la inicial de la marca y sus colores.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = c.colorFondo; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = c.colorAcento; ctx.font = 'bold 46px Arial'; ctx.textAlign = 'center';
    ctx.fillText(Array.from(c.nombre)[0] || 'R', 32, 49);
    document.querySelector('link[rel="icon"]')?.setAttribute('href', canvas.toDataURL());
  }
  text('.scene-heading p', c.encabezado); text('.gallery-label span:first-child', c.galeria);
  text('#plan-title', c.tituloPlano); text('#panel h1', `${c.nombre} en VR`);
  const vr = document.getElementById('vr'); if (vr) vr.hidden = !c.mostrarVR;
  const widget = document.querySelector('.floorplan-widget');
  if (widget) { widget.hidden = !c.mostrarPlano; widget.setAttribute('aria-label', c.tituloPlano); }
  document.getElementById('expand-plan')?.setAttribute('aria-label', `Ampliar ${c.tituloPlano}`);
  for (const img of document.querySelectorAll('#plan-preview img, #plan-dialog img')) {
    img.src = c.imagenPlano; img.alt = c.tituloPlano;
    const size = () => {
      if (!img.naturalWidth) return;
      img.width = img.naturalWidth; img.height = img.naturalHeight;
      document.documentElement.style.setProperty('--plan-ratio', img.naturalWidth / img.naturalHeight);
    };
    img.addEventListener('load', size); size();
  }
  return c;
}
