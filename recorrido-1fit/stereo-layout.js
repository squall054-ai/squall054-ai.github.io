// Las texturas de Three usan v=0 abajo: mitad superior = offset 0.5.
export function eyeOffsets(mode) {
  if (mode === 'mono') return [0.5, 0.5];
  if (mode === 'swapped') return [0, 0.5];
  return [0.5, 0];
}
