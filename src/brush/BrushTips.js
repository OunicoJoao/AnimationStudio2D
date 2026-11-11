/**
 * Gera e guarda em cache as pontas de pincel (máscaras brancas) e suas versões coloridas.
 * @module brush/BrushTips
 */
import { createCanvas } from '../render/canvas.js';
import { rgbaToHex } from '../core/color.js';

const RES_STEPS = [32, 64, 128, 256, 512];

/** Ruído determinístico para texturas (o mesmo lápis sempre tem o mesmo grão). */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class BrushTips {
  #masks = new Map();
  #colored = new Map();

  /** Resolução de ponta adequada para um diâmetro em pixels. */
  static resFor(size) {
    for (const r of RES_STEPS) if (r >= size * 1.25) return r;
    return RES_STEPS[RES_STEPS.length - 1];
  }

  /** Máscara branca da ponta. */
  mask(preset, res) {
    const key = `${preset.tip}|${preset.hardness ?? ''}|${preset.ratio ?? ''}|${res}`;
    let c = this.#masks.get(key);
    if (c) return c;
    c = createCanvas(res, res);
    const g = c.getContext('2d');
    const r = res / 2;
    switch (preset.tip) {
      case 'soft': {
        const hard = Math.min(0.98, preset.hardness ?? 0.5);
        const grad = g.createRadialGradient(r, r, 0, r, r, r);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(hard, 'rgba(255,255,255,1)');
        // queda suave (aproximação de gaussiana)
        for (let i = 1; i <= 6; i++) {
          const t = hard + ((1 - hard) * i) / 6;
          grad.addColorStop(Math.min(1, t), `rgba(255,255,255,${(Math.cos(((i / 6) * Math.PI)) + 1) / 2})`);
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, res, res);
        break;
      }
      case 'flat': {
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(r, r, r - 1, Math.max(1, (r - 1) * (preset.ratio ?? 0.35)), 0, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'grain':
      case 'chalk': {
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(r, r, r - 1, 0, Math.PI * 2);
        g.fill();
        const img = g.getImageData(0, 0, res, res);
        const d = img.data, rand = rng(preset.tip === 'chalk' ? 7 : 3);
        const chalk = preset.tip === 'chalk';
        for (let y = 0; y < res; y++) {
          for (let x = 0; x < res; x++) {
            const i = (y * res + x) * 4;
            if (!d[i + 3]) continue;
            const n = rand();
            const edge = Math.hypot(x - r, y - r) / r;
            // grão: pixels esparsos; giz: bordas irregulares e falhas
            let a = chalk ? (n > 0.35 + edge * 0.45 ? 1 : n * 0.25) : (n > 0.45 ? 0.55 + n * 0.45 : n * 0.5);
            if (!chalk) a *= 1 - Math.max(0, edge - 0.7) * 2;
            d[i + 3] = Math.round(d[i + 3] * Math.max(0, Math.min(1, a)));
          }
        }
        g.putImageData(img, 0, 0);
        break;
      }
      default: { // hard
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(r, r, r - 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    this.#masks.set(key, c);
    return c;
  }

  /** Ponta já tingida com a cor do traço. */
  colored(preset, res, color) {
    const key = `${preset.tip}|${preset.hardness ?? ''}|${preset.ratio ?? ''}|${res}|${rgbaToHex(color)}`;
    let c = this.#colored.get(key);
    if (c) return c;
    if (this.#colored.size > 48) this.#colored.clear();
    const m = this.mask(preset, res);
    c = createCanvas(res, res);
    const g = c.getContext('2d');
    g.fillStyle = rgbaToHex(color);
    g.fillRect(0, 0, res, res);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(m, 0, 0);
    this.#colored.set(key, c);
    return c;
  }
}
