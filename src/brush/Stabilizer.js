/**
 * Estabilizador de traço: suaviza o tremor da mão com uma "corda" (lazy brush)
 * seguida de média móvel exponencial. Puro, sem DOM.
 * @module brush/Stabilizer
 */
import { clamp } from '../core/math.js';

/** @typedef {{x:number, y:number, p:number}} StrokePoint  p = pressão 0–1 */

export class Stabilizer {
  /**
   * @param {number} amount  0 (desligado) a 1 (máximo)
   * @param {number} [scale=1] fator de escala da corda (use 1/zoom para ficar constante na tela)
   */
  constructor(amount = 0, scale = 1) {
    this.amount = clamp(amount, 0, 1);
    this.rope = this.amount * 24 * scale;
    this.weight = 1 - this.amount * 0.82;
    this.pos = null;
    this.last = null;
  }

  /** @param {StrokePoint} p */
  begin(p) {
    this.pos = { ...p };
    this.anchor = { ...p };
    this.last = { ...p };
    return { ...p };
  }

  /** Recebe um ponto bruto e devolve o ponto suavizado, ou null se a corda ainda não esticou. */
  push(p) {
    this.last = { ...p };
    if (this.amount <= 0) { this.pos = { ...p }; return { ...p }; }
    const a = this.anchor;
    const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
    if (d > this.rope) {
      const k = (d - this.rope) / d;
      a.x += dx * k; a.y += dy * k;
    }
    a.p = p.p;
    const w = this.weight;
    const nx = this.pos.x + (a.x - this.pos.x) * w;
    const ny = this.pos.y + (a.y - this.pos.y) * w;
    if (Math.hypot(nx - this.pos.x, ny - this.pos.y) < 0.05) return null;
    this.pos = { x: nx, y: ny, p: this.pos.p + (p.p - this.pos.p) * w };
    return { ...this.pos };
  }

  /** Ao soltar: completa o traço até o último ponto real, em passos suaves. */
  finish() {
    if (!this.pos || !this.last || this.amount <= 0) return [];
    const out = [];
    const d = Math.hypot(this.last.x - this.pos.x, this.last.y - this.pos.y);
    const steps = Math.min(12, Math.ceil(d / 2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      out.push({ x: this.pos.x + (this.last.x - this.pos.x) * t, y: this.pos.y + (this.last.y - this.pos.y) * t, p: this.pos.p + (this.last.p - this.pos.p) * t });
    }
    this.pos = { ...this.last };
    return out;
  }
}
