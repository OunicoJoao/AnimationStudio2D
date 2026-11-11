/** Opções compartilhadas entre ferramentas. @module tools/common */
import { SYMMETRY_MODES } from '../brush/Symmetry.js';

export const SYMMETRY_OPTION = {
  type: 'select',
  key: 'symmetry.mode',
  label: 'Simetria',
  icon: 'symmetry',
  options: Object.entries(SYMMETRY_MODES).map(([value, label]) => ({ value, label })),
};

/** Modo de combinação de seleção a partir das teclas: Shift soma, Alt subtrai, os dois interseção. */
export function selModeFrom(e, fallback = 'replace') {
  if (e.shift && e.alt) return 'intersect';
  if (e.shift) return 'add';
  if (e.alt) return 'subtract';
  return fallback;
}
