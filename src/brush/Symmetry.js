/**
 * Simetria de desenho: gera as matrizes de espelhamento/rotação aplicadas a cada traço.
 * @module brush/Symmetry
 */
import { Mat } from '../core/math.js';

export const SYMMETRY_MODES = {
  none: 'Desligada',
  vertical: 'Eixo vertical (esquerda ↔ direita)',
  horizontal: 'Eixo horizontal (cima ↔ baixo)',
  both: 'Quatro quadrantes',
  radial: 'Radial',
};

/**
 * @param {{mode: keyof SYMMETRY_MODES, count?: number}} sym
 * @param {number} cx  centro x @param {number} cy centro y
 * @returns {number[][]} lista de matrizes, a primeira é sempre a identidade
 */
export function symmetryMatrices(sym, cx, cy) {
  const about = (m) => Mat.chain(Mat.translate(cx, cy), m, Mat.translate(-cx, -cy));
  const id = Mat.identity();
  switch (sym?.mode) {
    case 'vertical': return [id, about(Mat.scale(-1, 1))];
    case 'horizontal': return [id, about(Mat.scale(1, -1))];
    case 'both': return [id, about(Mat.scale(-1, 1)), about(Mat.scale(1, -1)), about(Mat.scale(-1, -1))];
    case 'radial': {
      const n = Math.max(2, Math.min(16, sym.count || 6));
      return Array.from({ length: n }, (_, k) => about(Mat.rotate((k * 2 * Math.PI) / n)));
    }
    default: return [id];
  }
}

/** Indica se a matriz espelha (inverte orientação), útil para ajustar ângulos de ponta. */
export const isMirror = (m) => m[0] * m[3] - m[1] * m[2] < 0;
