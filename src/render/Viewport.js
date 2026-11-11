/**
 * Transformação da vista: zoom, deslocamento, rotação e espelhamento.
 * Converte entre coordenadas da tela (CSS px, relativas ao canvas) e do documento.
 * Puro, sem DOM.
 * @module render/Viewport
 */
import { Emitter } from '../core/Emitter.js';
import { Mat, clamp, deg2rad, normDeg } from '../core/math.js';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 32;

export class Viewport extends Emitter {
  constructor() {
    super();
    this.zoom = 1;
    this.panX = 0;   // posição na tela do centro do documento
    this.panY = 0;
    this.rotation = 0; // graus
    this.flipX = false;
    this.docW = 1;
    this.docH = 1;
    this.screenW = 1;
    this.screenH = 1;
  }

  setDocSize(w, h) { this.docW = w; this.docH = h; }
  setScreenSize(w, h) { this.screenW = w; this.screenH = h; }

  /** Matriz documento → tela. */
  get matrix() {
    return Mat.chain(
      Mat.translate(this.panX, this.panY),
      Mat.rotate(deg2rad(this.rotation)),
      Mat.scale(this.zoom * (this.flipX ? -1 : 1), this.zoom),
      Mat.translate(-this.docW / 2, -this.docH / 2),
    );
  }

  get inverse() { return Mat.invert(this.matrix); }

  toDoc(sx, sy) { const [x, y] = Mat.apply(this.inverse, sx, sy); return { x, y }; }
  toScreen(x, y) { const [sx, sy] = Mat.apply(this.matrix, x, y); return { x: sx, y: sy }; }

  #changed() { this.emit('change'); }

  /** Centraliza e ajusta o documento à área visível, com margem. */
  fit(margin = 32) {
    const z = Math.min((this.screenW - margin * 2) / this.docW, (this.screenH - margin * 2) / this.docH);
    this.zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
    this.panX = this.screenW / 2;
    this.panY = this.screenH / 2;
    this.rotation = 0;
    this.#changed();
  }

  /** Zoom mantendo o ponto (sx, sy) da tela fixo. */
  zoomAt(newZoom, sx = this.screenW / 2, sy = this.screenH / 2) {
    const z = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    const d = this.toDoc(sx, sy);
    this.zoom = z;
    const p = this.toScreen(d.x, d.y);
    this.panX += sx - p.x;
    this.panY += sy - p.y;
    this.#changed();
  }

  /** Passos de zoom "redondos" (dobro/metade suavizados). */
  zoomStep(dir, sx, sy) {
    const steps = [0.05, 0.08, 0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
    const z = this.zoom;
    const next = dir > 0 ? steps.find((s) => s > z * 1.01) ?? MAX_ZOOM : [...steps].reverse().find((s) => s < z / 1.01) ?? MIN_ZOOM;
    this.zoomAt(next, sx, sy);
  }

  panBy(dx, dy) { this.panX += dx; this.panY += dy; this.#changed(); }

  /** Gira a vista em torno de um ponto da tela. */
  rotateAt(deg, sx = this.screenW / 2, sy = this.screenH / 2) {
    const d = this.toDoc(sx, sy);
    this.rotation = normDeg(deg);
    const p = this.toScreen(d.x, d.y);
    this.panX += sx - p.x;
    this.panY += sy - p.y;
    this.#changed();
  }

  setFlip(v) {
    const c = this.toDoc(this.screenW / 2, this.screenH / 2);
    this.flipX = v;
    const p = this.toScreen(c.x, c.y);
    this.panX += this.screenW / 2 - p.x;
    this.panY += this.screenH / 2 - p.y;
    this.#changed();
  }

  /**
   * Aplica um gesto de pinça: estado inicial + dois dedos iniciais/atuais.
   * Faz zoom, deslocamento e rotação juntos (rotação com ímã em 0°/90°…).
   */
  pinch(start, a0, b0, a1, b1, allowRotate = true) {
    const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1, d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
    const ang0 = Math.atan2(b0.y - a0.y, b0.x - a0.x), ang1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
    const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    // restaura o estado inicial e encontra o ponto do documento sob o centro dos dedos
    Object.assign(this, start);
    const anchor = this.toDoc(m0.x, m0.y);
    this.zoom = clamp(start.zoom * (d1 / d0), MIN_ZOOM, MAX_ZOOM);
    if (allowRotate) {
      let r = start.rotation + ((ang1 - ang0) * 180) / Math.PI;
      const snap = Math.round(r / 90) * 90;
      if (Math.abs(r - snap) < 6) r = snap;
      this.rotation = normDeg(r);
    }
    const p = this.toScreen(anchor.x, anchor.y);
    this.panX += m1.x - p.x;
    this.panY += m1.y - p.y;
    this.#changed();
  }

  snapshot() {
    const { zoom, panX, panY, rotation, flipX } = this;
    return { zoom, panX, panY, rotation, flipX };
  }
}
