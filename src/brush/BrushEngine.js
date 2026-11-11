/**
 * Motor de pincel: recebe pontos (com pressão), estabiliza, amostra ao longo de curvas
 * e carimba a ponta num canvas de traço. A composição final (opacidade do traço,
 * borracha, trava de alfa, seleção) é feita por quem consome o canvas do traço.
 * @module brush/BrushEngine
 */
import { Stabilizer } from './Stabilizer.js';
import { StrokeSampler } from './StrokeSampler.js';
import { BrushTips } from './BrushTips.js';
import { Mat, Rect, lerp, deg2rad } from '../core/math.js';

export class BrushEngine {
  /** @param {BrushTips} tips */
  constructor(tips = new BrushTips()) {
    this.tips = tips;
    this.active = false;
  }

  /**
   * @param {object} o
   * @param {CanvasRenderingContext2D} o.ctx  destino (canvas do traço)
   * @param {object} o.preset  ver brush/presets.js
   * @param {number} o.size    diâmetro em pixels do documento
   * @param {number[]} o.color RGBA
   * @param {boolean} [o.usePressure=true]
   * @param {number} [o.stabilize=0]  0–1
   * @param {number} [o.viewScale=1]  1/zoom, para a corda do estabilizador ficar constante na tela
   * @param {number[][]} [o.matrices]  simetria
   * @param {{x:number,y:number,p:number}} o.start
   */
  begin({ ctx, preset, size, color, usePressure = true, stabilize = 0, viewScale = 1, matrices = [Mat.identity()], start }) {
    Object.assign(this, { ctx, preset, size, color, usePressure, matrices });
    this.active = true;
    this.bounds = Rect.empty();
    this.res = BrushTips.resFor(size);
    this.tip = this.tips.colored(preset, this.res, color);
    this.stab = new Stabilizer(stabilize, viewScale);
    this.sampler = new StrokeSampler((p) => Math.max(0.3, preset.spacing * this.#sizeAt(p)));
    this.seed = 1;
    const p0 = this.stab.begin(this.#norm(start));
    return this.#stamp(this.sampler.begin(p0));
  }

  /** Adiciona um ponto bruto; devolve a área alterada (ou null). */
  point(raw) {
    if (!this.active) return null;
    const p = this.stab.push(this.#norm(raw));
    if (!p) return null;
    return this.#stamp(this.sampler.add(p));
  }

  /** Termina o traço; devolve a caixa total desenhada. */
  end() {
    if (!this.active) return this.bounds;
    for (const p of this.stab.finish()) this.#stamp(this.sampler.add(p));
    this.#stamp(this.sampler.end());
    this.active = false;
    return this.bounds;
  }

  #norm(pt) {
    return { x: pt.x, y: pt.y, p: this.usePressure ? Math.max(0, Math.min(1, pt.p ?? 1)) : 1 };
  }

  #sizeAt(p) {
    const pr = this.preset;
    const f = pr.minSize + (1 - pr.minSize) * p;
    return this.size * lerp(1, f, pr.pSize);
  }

  #flowAt(p) {
    const pr = this.preset;
    return pr.flow * lerp(1, 0.12 + 0.88 * p, pr.pFlow);
  }

  #stamp(dabs) {
    if (!dabs.length) return null;
    const g = this.ctx, pr = this.preset, tip = this.tip;
    let dirty = Rect.empty();
    for (const d of dabs) {
      let s = this.#sizeAt(d.p);
      let alpha = this.#flowAt(d.p);
      if (s < 1) { alpha *= s; s = 1; }
      if (alpha <= 0.002) continue;
      g.globalAlpha = Math.min(1, alpha);
      const half = s / 2;
      for (const m of this.matrices) {
        const [x, y] = Mat.apply(m, d.x, d.y);
        let rot = 0;
        if (pr.tip === 'flat') {
          const a = deg2rad(pr.angle ?? 40);
          rot = Math.atan2(m[1] * Math.cos(a) + m[3] * Math.sin(a), m[0] * Math.cos(a) + m[2] * Math.sin(a));
        } else if (pr.jitter) {
          this.seed = (this.seed * 16807) % 2147483647;
          rot = (this.seed / 2147483647) * Math.PI * 2;
        }
        if (rot) {
          g.save();
          g.translate(x, y);
          g.rotate(rot);
          g.drawImage(tip, -half, -half, s, s);
          g.restore();
        } else {
          g.drawImage(tip, x - half, y - half, s, s);
        }
        dirty = Rect.union(dirty, { x: x - half - 1, y: y - half - 1, w: s + 2, h: s + 2 });
      }
    }
    g.globalAlpha = 1;
    this.bounds = Rect.union(this.bounds, dirty);
    return Rect.isEmpty(dirty) ? null : dirty;
  }
}
