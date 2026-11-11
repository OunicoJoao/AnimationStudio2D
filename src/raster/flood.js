/**
 * Algoritmos de região sobre buffers RGBA (puros, testáveis sem navegador).
 * @module raster/flood
 */

/**
 * Preenchimento por inundação (scanline) a partir de (x, y).
 * @param {Uint8ClampedArray} px  RGBA w×h
 * @param {number} w @param {number} h
 * @param {number} x @param {number} y
 * @param {object} [o]
 * @param {number} [o.tolerance=0]  0–255: diferença máxima por canal (inclui alfa)
 * @param {boolean} [o.contiguous=true]  false = todas as áreas de cor parecida
 * @param {Uint8Array|null} [o.limit]  máscara opcional: só entra onde limit[i] != 0
 * @returns {Uint8Array} máscara w×h com 1 onde a região foi atingida
 */
export function floodMask(px, w, h, x, y, { tolerance = 0, contiguous = true, limit = null } = {}) {
  const mask = new Uint8Array(w * h);
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return mask;
  const s = (y * w + x) * 4;
  const r0 = px[s], g0 = px[s + 1], b0 = px[s + 2], a0 = px[s + 3];
  const tol = tolerance;
  const transparentSeed = a0 === 0;
  const match = (p) => {
    const i = p * 4;
    if (limit && !limit[p]) return false;
    // Em áreas transparentes a cor RGB não importa, só o alfa.
    if (transparentSeed) return px[i + 3] <= tol;
    return Math.abs(px[i] - r0) <= tol && Math.abs(px[i + 1] - g0) <= tol &&
      Math.abs(px[i + 2] - b0) <= tol && Math.abs(px[i + 3] - a0) <= tol;
  };
  if (!contiguous) {
    for (let p = 0; p < w * h; p++) if (match(p)) mask[p] = 1;
    return mask;
  }
  if (!match(y * w + x)) return mask;
  const stack = [x, y];
  while (stack.length) {
    const sy = stack.pop(), sx = stack.pop();
    let lx = sx;
    const row = sy * w;
    while (lx > 0 && !mask[row + lx - 1] && match(row + lx - 1)) lx--;
    let rx = sx;
    while (rx < w - 1 && !mask[row + rx + 1] && match(row + rx + 1)) rx++;
    for (let i = lx; i <= rx; i++) mask[row + i] = 1;
    for (const ny of [sy - 1, sy + 1]) {
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let inRun = false;
      for (let i = lx; i <= rx; i++) {
        const p = nrow + i;
        const ok = !mask[p] && match(p);
        if (ok && !inRun) { stack.push(i, ny); inRun = true; } else if (!ok) inRun = false;
      }
    }
  }
  return mask;
}

/**
 * Dilata uma máscara binária em `radius` pixels (vizinhança circular).
 * Usa duas passadas separáveis de distância aproximada, rápido mesmo em telas grandes.
 */
export function dilateMask(mask, w, h, radius) {
  if (radius <= 0) return mask;
  let cur = mask;
  // Repetir dilatação de 1 px em cruz + diagonais aproxima um disco.
  for (let r = 0; r < radius; r++) {
    const out = new Uint8Array(cur);
    const diag = r % 2 === 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (cur[row + x]) continue;
        if ((x > 0 && cur[row + x - 1]) || (x < w - 1 && cur[row + x + 1]) ||
          (y > 0 && cur[row - w + x]) || (y < h - 1 && cur[row + w + x]) ||
          (diag && ((x > 0 && y > 0 && cur[row - w + x - 1]) || (x < w - 1 && y > 0 && cur[row - w + x + 1]) ||
            (x > 0 && y < h - 1 && cur[row + w + x - 1]) || (x < w - 1 && y < h - 1 && cur[row + w + x + 1])))) out[row + x] = 1;
      }
    }
    cur = out;
  }
  return cur;
}

/** Caixa delimitadora de uma máscara (valores != 0), ou null se vazia. */
export function maskBounds(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Caixa delimitadora dos pixels com alfa > 0 de um buffer RGBA. */
export function alphaBounds(px, w, h, threshold = 0) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    let row = y * w * 4;
    for (let x = 0; x < w; x++, row += 4) {
      if (px[row + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Contorno de uma máscara como segmentos [x0, y0, x1, y1] nas bordas dos pixels.
 * Segmentos colineares vizinhos são unidos. Usado para as "formigas" da seleção.
 * @param {(p:number)=>boolean} inside
 */
export function maskOutline(w, h, inside) {
  const segs = [];
  for (let y = 0; y <= h; y++) {
    let start = -1, side = 0;
    for (let x = 0; x <= w; x++) {
      let s = 0;
      if (x < w) {
        const a = y > 0 && inside((y - 1) * w + x), b = y < h && inside(y * w + x);
        s = a !== b ? (a ? 1 : 2) : 0;
      }
      if (s !== side) {
        if (side) segs.push(start, y, x, y);
        start = x; side = s;
      }
    }
  }
  for (let x = 0; x <= w; x++) {
    let start = -1, side = 0;
    for (let y = 0; y <= h; y++) {
      let s = 0;
      if (y < h) {
        const a = x > 0 && inside(y * w + x - 1), b = x < w && inside(y * w + x);
        s = a !== b ? (a ? 1 : 2) : 0;
      }
      if (s !== side) {
        if (side) segs.push(x, start, x, y);
        start = y; side = s;
      }
    }
  }
  return new Float32Array(segs);
}
