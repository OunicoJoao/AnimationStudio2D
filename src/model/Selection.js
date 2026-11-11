/**
 * Seleção como máscara de alfa (suave nas bordas), do tamanho do documento.
 * Oferece o contorno para desenhar as "formigas" e a máscara binária para algoritmos.
 * @module model/Selection
 */
import { createCanvas } from '../render/canvas.js';
import { maskOutline, alphaBounds } from '../raster/flood.js';

export const SEL_MODES = { replace: 'Substituir', add: 'Adicionar', subtract: 'Subtrair', intersect: 'Interseção' };

export class Selection {
  /** @param {HTMLCanvasElement} mask canvas w×h; alfa = quanto está selecionado */
  constructor(mask) {
    this.mask = mask;
    this.width = mask.width;
    this.height = mask.height;
    this.#analyze();
  }

  static #blank(w, h) { return createCanvas(w, h); }

  static fromRect(r, w, h) {
    const c = Selection.#blank(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
    return new Selection(c);
  }

  static fromEllipse(r, w, h) {
    const c = Selection.#blank(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
    g.fill();
    return new Selection(c);
  }

  /** @param {{x:number,y:number}[]} pts polígono do laço */
  static fromPolygon(pts, w, h) {
    const c = Selection.#blank(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fill();
    return new Selection(c);
  }

  /** @param {Uint8Array} bin máscara 0/1 */
  static fromBinary(bin, w, h) {
    const c = Selection.#blank(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let p = 0; p < bin.length; p++) if (bin[p]) img.data[p * 4 + 3] = 255;
    g.putImageData(img, 0, 0);
    return new Selection(c);
  }

  static all(w, h) { return Selection.fromRect({ x: 0, y: 0, w, h }, w, h); }

  /** Combina esta seleção (existente) com outra nova, devolvendo uma nova seleção. */
  combine(other, mode) {
    if (mode === 'replace' || !other) return other;
    const c = createCanvas(this.width, this.height);
    const g = c.getContext('2d');
    g.drawImage(this.mask, 0, 0);
    g.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'destination-in';
    g.drawImage(other.mask, 0, 0);
    const s = new Selection(c);
    return s.isEmpty ? null : s;
  }

  invert() {
    const c = createCanvas(this.width, this.height);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.width, this.height);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(this.mask, 0, 0);
    const s = new Selection(c);
    return s.isEmpty ? null : s;
  }

  /** Nova seleção com a máscara transformada por uma matriz (usada ao mover/escalar). */
  transformed(matrix) {
    const c = createCanvas(this.width, this.height);
    const g = c.getContext('2d');
    g.setTransform(...matrix);
    g.drawImage(this.mask, 0, 0);
    const s = new Selection(c);
    return s.isEmpty ? null : s;
  }

  get isEmpty() { return !this.bounds; }

  /** Alfa 0–255 por pixel (para filtros com borda suave). */
  get alpha() { return this.#alpha; }

  /** Máscara binária 0/1 (alfa ≥ 50%). */
  get binary() {
    if (!this.#binary) {
      const a = this.#alpha;
      this.#binary = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) this.#binary[i] = a[i] >= 128 ? 1 : 0;
    }
    return this.#binary;
  }

  /** Segmentos do contorno [x0,y0,x1,y1,...] em coordenadas do documento. */
  get outline() {
    if (!this.#outline) {
      const b = this.binary;
      this.#outline = maskOutline(this.width, this.height, (p) => b[p] === 1);
    }
    return this.#outline;
  }

  contains(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.#alpha[y * this.width + x] >= 128;
  }

  #alpha = null;
  #binary = null;
  #outline = null;

  #analyze() {
    const d = this.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.width, this.height).data;
    const a = new Uint8Array(this.width * this.height);
    for (let p = 0; p < a.length; p++) a[p] = d[p * 4 + 3];
    this.#alpha = a;
    this.bounds = alphaBounds(d, this.width, this.height, 0);
  }
}
