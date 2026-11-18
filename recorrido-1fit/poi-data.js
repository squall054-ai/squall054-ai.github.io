export const types = ['texto', 'audio', 'video', 'pdf', 'enlace'];
export function safeUrl(value, base = location.href) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export function validatePoints(points, sceneIds, base) {
  if (!Array.isArray(points)) throw new Error('Se esperaba una lista de puntos.');
  const ids = new Set();
  for (const p of points) {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id)) throw new Error('Hay un identificador vacío o repetido.');
    ids.add(p.id);
    if (!sceneIds.includes(p.scene)) throw new Error('Panorama desconocido: ' + p.scene);
    if (!types.includes(p.type) || typeof p.title !== 'string' || !p.title.trim()) throw new Error('Revisa el tipo y título de ' + p.id);
    if (!Number.isFinite(p.yaw) || !Number.isFinite(p.pitch) || Math.abs(p.pitch) > 90) throw new Error('Posición inválida: ' + p.id);
    if (p.text !== undefined && typeof p.text !== 'string') throw new Error('Texto inválido: ' + p.id);
    if (p.type !== 'texto' && !safeUrl(p.url, base)) throw new Error('URL inválida: ' + p.id);
  }
  return points;
}
