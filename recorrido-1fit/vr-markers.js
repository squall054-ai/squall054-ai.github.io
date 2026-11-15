// El suelo es una referencia para los marcadores, no cambia la altura fotografiada.
export function markerPlacement(link, eyeHeight = 1.65) {
  const yaw = parseFloat(link.position.yaw) * Math.PI / 180;
  const pitch = parseFloat(link.position.pitch) * Math.PI / 180;
  const door = link.data?.marker === 'puerta';
  // Cerca del horizonte no existe una intersección útil con el suelo.
  const floor = !door && pitch < -3 * Math.PI / 180;
  const distance = floor ? eyeHeight / -Math.sin(pitch) : 3;
  return {
    floor, yaw,
    x: -Math.cos(pitch) * Math.sin(yaw) * distance,
    y: Math.sin(pitch) * distance,
    z: Math.cos(pitch) * Math.cos(yaw) * distance,
    size: floor ? 0.48 : 0.3,
  };
}
