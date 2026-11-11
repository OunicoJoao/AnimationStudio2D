/**
 * Funções matemáticas puras usadas em todo o app (sem DOM).
 * @module core/math
 */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;

/** Normaliza um ângulo em graus para o intervalo (-180, 180]. */
export function normDeg(d) {
  let a = ((d % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
}

/**
 * Retângulo inteiro {x, y, w, h}. Funções utilitárias para caixas delimitadoras.
 */
export const Rect = {
  empty: () => ({ x: 0, y: 0, w: 0, h: 0 }),
  isEmpty: (r) => !r || r.w <= 0 || r.h <= 0,
  /** Caixa a partir de dois cantos (não precisa estar ordenada). */
  fromPoints(x0, y0, x1, y1) {
    const x = Math.min(x0, x1), y = Math.min(y0, y1);
    return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  },
  union(a, b) {
    if (Rect.isEmpty(a)) return b ? { ...b } : Rect.empty();
    if (Rect.isEmpty(b)) return { ...a };
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  },
  intersect(a, b) {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
    return w > 0 && h > 0 ? { x, y, w, h } : Rect.empty();
  },
  /** Arredonda para fora até a grade de pixels inteiros. */
  roundOut(r) {
    const x = Math.floor(r.x), y = Math.floor(r.y);
    return { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y };
  },
  inflate: (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 }),
  /** Recorta a caixa para os limites de uma imagem w×h, com coordenadas inteiras. */
  clampTo(r, w, h) {
    return Rect.intersect(Rect.roundOut(r), { x: 0, y: 0, w, h });
  },
  contains: (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h,
};

/**
 * Matriz afim 2D [a, b, c, d, e, f] — mesma convenção do canvas:
 * x' = a·x + c·y + e ;  y' = b·x + d·y + f
 */
export const Mat = {
  identity: () => [1, 0, 0, 1, 0, 0],
  multiply(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  },
  translate: (tx, ty) => [1, 0, 0, 1, tx, ty],
  scale: (sx, sy = sx) => [sx, 0, 0, sy, 0, 0],
  rotate(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    return [c, s, -s, c, 0, 0];
  },
  invert(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (!det) return Mat.identity();
    const id = 1 / det;
    return [
      m[3] * id,
      -m[1] * id,
      -m[2] * id,
      m[0] * id,
      (m[2] * m[5] - m[3] * m[4]) * id,
      (m[1] * m[4] - m[0] * m[5]) * id,
    ];
  },
  apply: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
  /** Compõe várias matrizes da esquerda para a direita (a primeira é a mais externa). */
  chain(...ms) {
    return ms.reduce((acc, m) => Mat.multiply(acc, m), Mat.identity());
  },
};

/** Caixa delimitadora de pontos transformados por uma matriz. */
export function transformedBounds(m, r) {
  const pts = [
    Mat.apply(m, r.x, r.y),
    Mat.apply(m, r.x + r.w, r.y),
    Mat.apply(m, r.x, r.y + r.h),
    Mat.apply(m, r.x + r.w, r.y + r.h),
  ];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Ajusta o fim de uma linha para ângulos múltiplos de 15° (Shift). */
export function snapAngle(x0, y0, x1, y1, stepDeg = 15) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const step = deg2rad(stepDeg);
  const sa = Math.round(a / step) * step;
  const d = Math.hypot(x1 - x0, y1 - y0);
  return [x0 + Math.cos(sa) * d, y0 + Math.sin(sa) * d];
}

/** Ajusta um retângulo arrastado para virar quadrado (Shift). */
export function squareFrom(x0, y0, x1, y1) {
  const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  return [x0 + Math.sign(x1 - x0 || 1) * s, y0 + Math.sign(y1 - y0 || 1) * s];
}
