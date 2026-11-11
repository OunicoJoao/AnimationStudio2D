/**
 * Seletor de cor HSV: quadro saturação/brilho, faixa de matiz, faixa de opacidade e campo hex.
 * @module ui/ColorPicker
 */
import { h, drag } from './dom.js';
import { rgbToHsv, hsvToRgb, rgbaToHex, hexToRgba } from '../core/color.js';
import { clamp } from '../core/math.js';

export class ColorPicker {
  /**
   * @param {object} o
   * @param {number[]} o.color RGBA inicial
   * @param {(c: number[], live: boolean) => void} o.onChange
   * @param {boolean} [o.alpha=true]
   */
  constructor({ color, onChange, alpha = true }) {
    this.onChange = onChange;
    this.showAlpha = alpha;
    this.sv = h('div.cp-sv', { role: 'slider', tabindex: 0, 'aria-label': 'Saturação e brilho' }, h('div.cp-knob'));
    this.hue = h('div.cp-hue', { role: 'slider', tabindex: 0, 'aria-label': 'Matiz', 'aria-valuemin': 0, 'aria-valuemax': 360 }, h('div.cp-thumb'));
    this.alpha = h('div.cp-alpha', { role: 'slider', tabindex: 0, 'aria-label': 'Opacidade', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div.cp-alpha-fill'), h('div.cp-thumb'));
    this.hex = h('input.field.cp-hex', { type: 'text', maxLength: 9, spellcheck: false, 'aria-label': 'Cor em hexadecimal' });
    this.swatch = h('span.cp-swatch');
    this.el = h('div.cp', this.sv, this.hue, alpha ? this.alpha : null, h('div.cp-row', this.swatch, this.hex));
    this.set(color, false);

    const svAt = (e) => {
      const r = this.sv.getBoundingClientRect();
      this.s = clamp((e.clientX - r.left) / r.width, 0, 1);
      this.v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
      this.#emit(true);
    };
    drag(this.sv, { start: svAt, move: svAt, end: () => this.#emit(false) });
    const hueAt = (e) => { const r = this.hue.getBoundingClientRect(); this.h = clamp((e.clientX - r.left) / r.width, 0, 1) * 360; this.#emit(true); };
    drag(this.hue, { start: hueAt, move: hueAt, end: () => this.#emit(false) });
    const aAt = (e) => { const r = this.alpha.getBoundingClientRect(); this.a = Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 255); this.#emit(true); };
    drag(this.alpha, { start: aAt, move: aAt, end: () => this.#emit(false) });
    this.hex.addEventListener('change', () => {
      const c = hexToRgba(this.hex.value);
      if (c) this.set(alpha ? c : [c[0], c[1], c[2], 255], true);
      else this.#paint();
    });
    const keyNudge = (el, fn) => el.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (d === undefined) return;
      e.preventDefault();
      fn(d * (e.shiftKey ? 10 : 1), e.key);
      this.#emit(false);
    });
    keyNudge(this.hue, (d) => { this.h = (this.h + d + 360) % 360; });
    keyNudge(this.alpha, (d) => { this.a = clamp(this.a + d * 2.55, 0, 255); });
    keyNudge(this.sv, (d, k) => { if (k === 'ArrowLeft' || k === 'ArrowRight') this.s = clamp(this.s + d / 100, 0, 1); else this.v = clamp(this.v + d / 100, 0, 1); });
  }

  get color() {
    const [r, g, b] = hsvToRgb(this.h, this.s, this.v);
    return [r, g, b, Math.round(this.a)];
  }

  /** Define a cor; com `emit`, avisa o ouvinte. */
  set(c, emit = false) {
    const [hh, ss, vv] = rgbToHsv(c[0], c[1], c[2]);
    // preserva o matiz ao passar por cinzas
    if (ss > 0.001 && vv > 0.001) this.h = hh;
    else this.h ??= 0;
    this.s = ss; this.v = vv; this.a = c[3] ?? 255;
    this.#paint();
    if (emit) this.onChange?.(this.color, false);
  }

  #emit(live) {
    this.#paint();
    this.onChange?.(this.color, live);
  }

  #paint() {
    const c = this.color;
    this.sv.style.setProperty('--hue', `hsl(${this.h} 100% 50%)`);
    const k = this.sv.firstChild;
    k.style.left = `${this.s * 100}%`;
    k.style.top = `${(1 - this.v) * 100}%`;
    k.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
    this.hue.firstChild.style.left = `${(this.h / 360) * 100}%`;
    this.hue.setAttribute('aria-valuenow', Math.round(this.h));
    this.alpha.style.setProperty('--solid', `rgb(${c[0]},${c[1]},${c[2]})`);
    this.alpha.lastChild.style.left = `${(this.a / 255) * 100}%`;
    this.alpha.setAttribute('aria-valuenow', Math.round((this.a / 255) * 100));
    this.swatch.style.setProperty('--c', `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`);
    if (document.activeElement !== this.hex) this.hex.value = rgbaToHex(c, this.showAlpha).toUpperCase();
  }
}
