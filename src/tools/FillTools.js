/**
 * Ferramentas de preenchimento: balde, laço de preenchimento e degradê.
 * @module tools/FillTools
 */
import { Tool } from './Tool.js';
import { floodMask, dilateMask, maskBounds } from '../raster/flood.js';
import { renderFrame } from '../render/Compositor.js';
import { symmetryMatrices } from '../brush/Symmetry.js';
import { rgbaToCss } from '../core/color.js';
import { Rect } from '../core/math.js';
import { SYMMETRY_OPTION } from './common.js';

export class FillTool extends Tool {
  static id = 'fill';
  static label = 'Balde';
  static icon = 'bucket';
  static key = 'G';
  static hint = 'Preenche áreas fechadas; "Avançar sob o traço" cobre as bordas suaves das linhas';
  get paints() { return true; }
  get cursor() { return 'crosshair'; }

  down(e) {
    const { ws, paint, settings, colors, toast } = this.ctx;
    if (!paint.canPaint()) return;
    const p = ws.project, o = settings.get('fill');
    const x = Math.floor(e.x), y = Math.floor(e.y);
    if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
    const w = p.width, h = p.height;
    let src;
    if (o.sample === 'all') src = renderFrame(p, ws.frameIndex, { background: false });
    else src = p.getCel(ws.layerId, ws.frameId);
    const px = src ? src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data : new Uint8ClampedArray(w * h * 4);
    const limit = ws.selection ? ws.selection.binary : null;
    const tol = Math.round((o.tolerance / 100) * 255);
    const core = floodMask(px, w, h, x, y, { tolerance: tol, contiguous: o.contiguous, limit });
    let grown = o.expand > 0 ? dilateMask(core, w, h, o.expand) : core;
    if (limit && grown !== core) { grown = new Uint8Array(grown); for (let i = 0; i < grown.length; i++) if (!limit[i]) grown[i] = 0; }
    const b = maskBounds(grown, w, h);
    if (!b) { toast('Toque dentro de uma área para preencher.'); return; }
    const c = colors.fg;
    const fa = c[3] / 255;
    const alphaLock = ws.layer.alphaLock;
    paint.editPixels(b, (img, r) => {
      const d = img.data;
      for (let yy = 0; yy < r.h; yy++) {
        for (let xx = 0; xx < r.w; xx++) {
          const p0 = (r.y + yy) * w + (r.x + xx);
          if (!grown[p0]) continue;
          const i = (yy * r.w + xx) * 4;
          const da = d[i + 3] / 255;
          if (alphaLock) {
            if (!da) continue;
            for (let k = 0; k < 3; k++) d[i + k] += (c[k] - d[i + k]) * fa;
            continue;
          }
          if (core[p0]) {
            // por cima (substitui a área de cor parecida)
            const oa = fa + da * (1 - fa);
            for (let k = 0; k < 3; k++) d[i + k] = oa ? (c[k] * fa + d[i + k] * da * (1 - fa)) / oa : 0;
            d[i + 3] = oa * 255;
          } else {
            // borda expandida: por baixo das linhas, sem apagá-las
            const oa = da + fa * (1 - da);
            for (let k = 0; k < 3; k++) d[i + k] = oa ? (d[i + k] * da + c[k] * fa * (1 - da)) / oa : 0;
            d[i + 3] = oa * 255;
          }
        }
      }
    }, 'Balde');
    colors.remember();
  }

  options() {
    return [
      { type: 'slider', key: 'fill.tolerance', label: 'Tolerância', min: 0, max: 100, step: 1, unit: '%' },
      { type: 'slider', key: 'fill.expand', label: 'Avançar sob o traço', min: 0, max: 8, step: 1, unit: 'px' },
      { type: 'segmented', key: 'fill.sample', label: 'Detectar bordas em', options: [{ value: 'all', label: 'Todas as camadas' }, { value: 'layer', label: 'Só esta camada' }] },
      { type: 'toggle', key: 'fill.contiguous', label: 'Só áreas ligadas', icon: 'contiguous' },
    ];
  }
}

export class LassoFillTool extends Tool {
  static id = 'lassoFill';
  static label = 'Laço de preenchimento';
  static icon = 'lassoFill';
  static key = 'F';
  static hint = 'Contorne uma área para pintá-la de uma vez; Alt apaga';
  get paints() { return true; }

  down(e) {
    if (!this.ctx.paint.canPaint()) return;
    this.pts = [{ x: e.x, y: e.y }];
    this.erase = e.alt || this.ctx.settings.get('lassoFill.mode') === 'erase';
    this.#preview();
  }

  move(e) {
    if (!this.pts) return;
    const last = this.pts.at(-1);
    if (Math.hypot(e.x - last.x, e.y - last.y) * this.ctx.viewport.zoom < 2) return;
    this.pts.push({ x: e.x, y: e.y });
    this.#preview();
  }

  #draw(g) {
    const { colors, ws } = this.ctx;
    const p = ws.project;
    g.fillStyle = rgbaToCss([colors.fg[0], colors.fg[1], colors.fg[2], 255]);
    for (const m of symmetryMatrices(this.ctx.settings.get('symmetry'), p.width / 2, p.height / 2)) {
      g.save();
      g.setTransform(...m);
      g.beginPath();
      this.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.closePath();
      g.fill();
      g.restore();
    }
  }

  #preview() {
    const { paint, stage, colors } = this.ctx;
    const c = paint.freshStrokeCanvas();
    this.#draw(c.getContext('2d'));
    const opacity = (this.ctx.settings.get('lassoFill.opacity') / 100) * (colors.fg[3] / 255);
    stage.toolPreview = paint.previewFor(c, { opacity: this.erase ? 1 : opacity, mode: this.erase ? 'erase' : 'paint' });
    this.render();
  }

  up() {
    if (!this.pts) return;
    const { paint, stage, colors, ws } = this.ctx;
    const pts = this.pts;
    this.pts = null;
    stage.toolPreview = null;
    if (pts.length < 3) return this.render();
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    let bounds = Rect.fromPoints(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    if (this.ctx.settings.get('symmetry.mode') !== 'none') bounds = { x: 0, y: 0, w: ws.project.width, h: ws.project.height };
    const opacity = (this.ctx.settings.get('lassoFill.opacity') / 100) * (colors.fg[3] / 255);
    paint.commitStroke(paint.strokeCanvas, bounds, { opacity: this.erase ? 1 : opacity, mode: this.erase ? 'erase' : 'paint', label: this.erase ? 'Laço apagar' : 'Laço de preenchimento' });
    if (!this.erase) colors.remember();
    this.render();
  }

  cancel() { this.pts = null; this.ctx.stage.toolPreview = null; this.render(); }

  options() {
    return [
      { type: 'segmented', key: 'lassoFill.mode', label: 'Modo', options: [{ value: 'fill', label: 'Pintar', icon: 'lassoFill' }, { value: 'erase', label: 'Apagar', icon: 'eraser' }] },
      { type: 'slider', key: 'lassoFill.opacity', label: 'Opacidade', min: 1, max: 100, step: 1, unit: '%' },
      SYMMETRY_OPTION,
    ];
  }
}

export class GradientTool extends Tool {
  static id = 'gradient';
  static label = 'Degradê';
  static icon = 'gradient';
  static key = 'D';
  static hint = 'Arraste para definir a direção; Shift prende em 15°';
  get paints() { return true; }

  down(e) {
    if (!this.ctx.paint.canPaint()) return;
    this.p0 = { x: e.x, y: e.y };
    this.p1 = { x: e.x, y: e.y };
    this.#preview();
  }

  move(e) {
    if (!this.p0) return;
    let { x, y } = e;
    if (e.shift) {
      const a = Math.atan2(y - this.p0.y, x - this.p0.x), s = Math.PI / 12, d = Math.hypot(x - this.p0.x, y - this.p0.y);
      const sa = Math.round(a / s) * s;
      x = this.p0.x + Math.cos(sa) * d; y = this.p0.y + Math.sin(sa) * d;
    }
    this.p1 = { x, y };
    this.#preview();
  }

  #preview() {
    const { paint, stage, ws, colors, settings } = this.ctx;
    const p = ws.project, o = settings.get('gradient');
    const c = paint.freshStrokeCanvas();
    const g = c.getContext('2d');
    const { p0, p1 } = this;
    const grad = o.kind === 'radial'
      ? g.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y)))
      : g.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    const fg = colors.fg, end = o.end === 'bg' ? colors.bg : [fg[0], fg[1], fg[2], 0];
    grad.addColorStop(0, rgbaToCss(fg));
    grad.addColorStop(1, rgbaToCss(end));
    g.fillStyle = grad;
    g.fillRect(0, 0, p.width, p.height);
    stage.toolPreview = paint.previewFor(c, { opacity: 1 });
    this.render();
  }

  up() {
    if (!this.p0) return;
    const { paint, stage, ws } = this.ctx;
    const moved = Math.hypot(this.p1.x - this.p0.x, this.p1.y - this.p0.y) > 1;
    this.p0 = null;
    stage.toolPreview = null;
    if (moved) {
      const b = ws.selection ? ws.selection.bounds : { x: 0, y: 0, w: ws.project.width, h: ws.project.height };
      paint.commitStroke(paint.strokeCanvas, b, { opacity: 1, label: 'Degradê' });
    }
    this.render();
  }

  cancel() { this.p0 = null; this.ctx.stage.toolPreview = null; this.render(); }

  drawOverlay(g) {
    if (!this.p0) return;
    const vp = this.ctx.viewport;
    const a = vp.toScreen(this.p0.x, this.p0.y), b = vp.toScreen(this.p1.x, this.p1.y);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
    g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#111'; g.stroke();
    for (const q of [a, b]) { g.beginPath(); g.arc(q.x, q.y, 5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.stroke(); }
  }

  options() {
    return [
      { type: 'segmented', key: 'gradient.kind', label: 'Forma', options: [{ value: 'linear', label: 'Linear', icon: 'gradient' }, { value: 'radial', label: 'Radial', icon: 'radial' }] },
      { type: 'segmented', key: 'gradient.end', label: 'Termina em', options: [{ value: 'transparent', label: 'Transparente' }, { value: 'bg', label: '2ª cor' }] },
    ];
  }
}
