// Un giro por pulsación lateral; exige regresar al centro para repetir.
export function createStickAction() {
  let armed = false;
  return (sources = [], blocked = false) => {
    const axes = Array.from(sources)
      .filter(s => s.gamepad?.mapping === 'xr-standard' && s.gamepad.axes.length >= 4)
      .sort((a, b) => (a.handedness === 'right' ? -1 : 0) - (b.handedness === 'right' ? -1 : 0))
      .map(s => s.gamepad.axes.slice(2, 4).map(v => Number.isFinite(v) ? v : 0));
    if (blocked || !axes.length) { armed = false; return null; }
    if (axes.every(([x,y]) => Math.max(Math.abs(x),Math.abs(y)) < 0.25)) { armed = true; return null; }
    const stick = axes.find(([x,y]) => Math.max(Math.abs(x),Math.abs(y)) >= 0.7);
    if (!armed || !stick) return null;
    armed = false;
    const [x,y] = stick;
    // Una diagonal ejecuta solamente el eje dominante, nunca giro y salto juntos.
    return Math.abs(x) >= Math.abs(y)
      ? { turn: Math.sign(x) * Math.PI / 6 }
      : { travel: y < 0 ? 'forward' : 'backward' };
  };
}

export function directionalLink(links, direction, rotation, backward = false) {
  const length = Math.hypot(direction.x, direction.z);
  if (length < 0.1) return null; // Mirar casi verticalmente no define un rumbo fiable.
  const sign = backward ? -1 : 1;
  let best = null, score = Math.cos(Math.PI / 3);
  for (const link of links || []) {
    const yaw = parseFloat(link.position?.yaw) * Math.PI / 180;
    const pitch = parseFloat(link.position?.pitch);
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || Math.abs(pitch) >= 89) continue;
    const angle = rotation - yaw;
    const dot = sign * (Math.sin(angle)*direction.x + Math.cos(angle)*direction.z) / length;
    if (dot > score) { score = dot; best = link; }
  }
  return best;
}
