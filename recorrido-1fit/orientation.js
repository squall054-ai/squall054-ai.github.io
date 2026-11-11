// Angulos de llegada expresados en el sistema del panorama de DESTINO.
export function arrivalPosition(node, fromNode, fromLink) {
  const explicit = fromLink?.data?.arrivalYaw;
  const backLink = fromLink && fromNode && node.links?.find(link => link.nodeId === fromNode.id);
  const yaw = Number.isFinite(explicit)
    ? explicit
    : backLink
      ? parseFloat(backLink.position.yaw) + 180
      : (node.data?.yaw || 0);
  return { yaw: `${((yaw % 360) + 360) % 360}deg`, pitch: '0deg' };
}
