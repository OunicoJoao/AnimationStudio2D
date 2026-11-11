/**
 * Converte pontos de entrada em "carimbos" (dabs) igualmente espaçados ao longo de
 * curvas quadráticas que passam pelos pontos médios — o traço fica liso mesmo com
 * poucos eventos de ponteiro. Puro, sem DOM.
 * @module brush/StrokeSampler
 */

/** @typedef {{x:number, y:number, p:number}} StrokePoint */
/** @typedef {{x:number, y:number, p:number, angle:number}} Dab */

export class StrokeSampler {
  /** @param {(pressure:number) => number} spacingAt  distância entre carimbos para uma pressão */
  constructor(spacingAt) {
    this.spacingAt = spacingAt;
    this.pts = [];
    this.carry = 0;
    this.lastDab = null;
  }

  /** @param {StrokePoint} p @returns {Dab[]} */
  begin(p) {
    this.pts = [p];
    this.carry = 0;
    const dab = { x: p.x, y: p.y, p: p.p, angle: 0 };
    this.lastDab = dab;
    return [dab];
  }

  /** @param {StrokePoint} p @returns {Dab[]} */
  add(p) {
    const pts = this.pts;
    const prev = pts[pts.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) < 0.2) return [];
    pts.push(p);
    if (pts.length === 2) {
      // primeiro trecho: reta até o meio do segmento
      const m = mid(pts[0], pts[1]);
      return this.#sampleQuad(pts[0], pts[0], m);
    }
    const [a, b, c] = pts.slice(-3);
    if (pts.length > 3) pts.shift();
    return this.#sampleQuad(mid(a, b), b, mid(b, c));
  }

  /** Fecha o traço até o último ponto. @returns {Dab[]} */
  end() {
    const pts = this.pts;
    if (pts.length < 2) return [];
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const m = mid(a, b);
    const out = this.#sampleQuad(m, m, b);
    this.pts = [];
    return out;
  }

  #sampleQuad(p0, c, p1) {
    const out = [];
    const approx = Math.hypot(c.x - p0.x, c.y - p0.y) + Math.hypot(p1.x - c.x, p1.y - c.y);
    if (approx < 1e-6) return out;
    const n = Math.max(2, Math.ceil(approx * 2));
    let px = p0.x, py = p0.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * p0.x + 2 * u * t * c.x + t * t * p1.x;
      const y = u * u * p0.y + 2 * u * t * c.y + t * t * p1.y;
      const pr = u * u * p0.p + 2 * u * t * c.p + t * t * p1.p;
      let seg = Math.hypot(x - px, y - py);
      const angle = Math.atan2(y - py, x - px);
      let sx = px, sy = py;
      while (seg > 0) {
        const spacing = Math.max(0.25, this.spacingAt(pr));
        const need = spacing - this.carry;
        if (seg >= need) {
          const k = need / seg;
          sx += (x - sx) * k; sy += (y - sy) * k;
          seg -= need;
          this.carry = 0;
          const dab = { x: sx, y: sy, p: pr, angle };
          out.push(dab);
          this.lastDab = dab;
        } else {
          this.carry += seg;
          seg = 0;
        }
      }
      px = x; py = y;
    }
    return out;
  }
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 });
