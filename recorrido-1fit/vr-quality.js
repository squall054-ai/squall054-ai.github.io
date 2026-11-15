export function supportsHighQuality(nodes, maxTextureSize) {
  return maxTextureSize >= 16384 && nodes.some(n => (n.tiles?.width || 8192) > 8192);
}
export function qualitySource(node, quality, maxTextureSize) {
  const full = { width: 8192, cols: 8, rows: 4, directory: '', ...node.tiles };
  const useHigh = quality === '16k' && maxTextureSize >= 16384;
  const tiles = useHigh ? full : (node.vrTiles || full);
  return { ...tiles, width: Math.min(tiles.width, useHigh ? 16384 : 8192, maxTextureSize), directory: tiles.directory || '' };
}
