// Los enlaces indican direcciones, no distancias: elegir el más alineado.
export function directionalLink(links, yaw, backwards = false) {
  const heading = yaw + (backwards ? Math.PI : 0);
  let best = null;
  let bestAngle = Math.PI / 3;
  for (const link of links || []) {
    const angle = parseFloat(link.position.yaw) * Math.PI / 180 - heading;
    const difference = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    if (difference < bestAngle) {
      best = link;
      bestAngle = difference;
    }
  }
  return best;
}
