/**
 * Formas: linha, retângulo, elipse e seta, com contorno, preenchimento ou ambos.
 * @module tools/ShapeTool
 */
import { Tool } from './Tool.js';
import { symmetryMatrices } from '../brush/Symmetry.js';
import { rgbaToCss } from '../core/color.js';
import { Rect, snapAngle, squareFrom } from '../core/math.js';
import { SYMMETRY_OPTION } from './common.js';

export class ShapeTool extends Tool {
  static id = 'shape';
  static label = 'Formas';
  static icon = 'shapes';
  static key = 'U';
  static hint = 'Shift deixa proporcional; Alt desenha a partir do centro';
  get paints() { return true; }

  down(e) {
    if (!this.ctx.paint.canPaint()) return;
    this.a = { x: e.x, y: e.y };
    this.b = { x: e.x, y: e.y };
    this.mods = e;
    this.#preview();
  }

  move(e) {
    if (!this.a) return;
    this.b = { x: e.x, y: e.y };
    this.mods = e;
    this.#preview();
  }

  /** Pontos finais já com Shift/Alt aplicados. */
  #geom() {
    const o = this.ctx.settings.get('shape');
    let { x: x0, y: y0 } = this.a, { x: x1, y: y1 } = this.b;
    const e = this.mods;
    if (o.kind === 'line' || o.kind === 'arrow') {
      if (e.shift) [x1, y1] = snapAngle(x0, y0, x1, y1);
      if (e.alt) { x0 = 2 * this.a.x - x1; y0 = 2 * this.a.y - y1; }
    } else {
      if (e.shift) [x1, y1] = squareFrom(x0, y0, x1, y1);
      if (e.alt) { x0 = 2 * this.a.x - x1; y0 = 2 * this.a.y - y1; }
    }
    return { x0, y0, x1, y1 };
  }

  #draw(g) {
    const { settings, colors, ws } = this.ctx;
    const o = settings.get('shape');
    const { x0, y0, x1, y1 } = this.#geom();
    const p = ws.project;
    const solid = (c) => rgbaToCss([c[0], c[1], c[2], 255]);
    for (const m of symmetryMatrices(settings.get('symmetry'), p.width / 2, p.height / 2)) {
      g.save();
      g.setTransform(...m);
      g.lineWidth = o.size;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = solid(colors.fg);
      g.fillStyle = solid(o.mode === 'both' ? colors.bg : colors.fg);
      g.beginPath();
      if (o.kind === 'line' || o.kind === 'arrow') {
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        if (o.kind === 'arrow') {
          const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.max(12, o.size * 4);
          g.moveTo(x1 - Math.cos(ang - 0.45) * len, y1 - Math.sin(ang - 0.45) * len);
          g.lineTo(x1, y1);
          g.lineTo(x1 - Math.cos(ang + 0.45) * len, y1 - Math.sin(ang + 0.45) * len);
        }
        g.stroke();
      } else {
        const r = Rect.fromPoints(x0, y0, x1, y1);
        if (o.kind === 'ellipse') g.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
        else if (o.kind === 'roundrect' && g.roundRect) g.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.18);
        else g.rect(r.x, r.y, r.w, r.h);
        if (o.mode !== 'stroke') g.fill();
        if (o.mode !== 'fill') g.stroke();
      }
      g.restore();
    }
  }

  #preview() {
    const { paint, stage, settings, colors } = this.ctx;
    const c = paint.freshStrokeCanvas();
    this.#draw(c.getContext('2d'));
    stage.toolPreview = paint.previewFor(c, { opacity: (settings.get('shape.opacity') ?? 100) / 100 * (colors.fg[3] / 255) });
    this.render();
  }

  up() {
    if (!this.a) return;
    const { paint, stage, ws, settings, colors } = this.ctx;
    const { x0, y0, x1, y1 } = this.#geom();
    this.a = null;
    stage.toolPreview = null;
    if (Math.hypot(x1 - x0, y1 - y0) < 1) return this.render();
    const pad = settings.get('shape.size') * 2 + 4;
    let bounds = Rect.inflate(Rect.fromPoints(x0, y0, x1, y1), pad);
    if (settings.get('symmetry.mode') !== 'none') bounds = { x: 0, y: 0, w: ws.project.width, h: ws.project.height };
    paint.commitStroke(paint.strokeCanvas, bounds, { opacity: (settings.get('shape.opacity') ?? 100) / 100 * (colors.fg[3] / 255), label: 'Forma' });
    colors.remember();
    this.render();
  }

  cancel() { this.a = null; this.ctx.stage.toolPreview = null; this.render(); }

  options() {
    return [
      { type: 'segmented', key: 'shape.kind', label: 'Forma', options: [
        { value: 'line', label: 'Linha', icon: 'line' },
        { value: 'arrow', label: 'Seta', icon: 'arrow' },
        { value: 'rect', label: 'Retângulo', icon: 'rect' },
        { value: 'roundrect', label: 'Retângulo arredondado', icon: 'roundrect' },
        { value: 'ellipse', label: 'Elipse', icon: 'ellipse' },
      ] },
      { type: 'segmented', key: 'shape.mode', label: 'Estilo', options: [
        { value: 'stroke', label: 'Contorno', icon: 'outline' },
        { value: 'fill', label: 'Preenchida', icon: 'filled' },
        { value: 'both', label: 'Contorno + 2ª cor', icon: 'both' },
      ] },
      { type: 'slider', key: 'shape.size', label: 'Espessura', min: 1, max: 200, step: 1, unit: 'px', log: true },
      SYMMETRY_OPTION,
    ];
  }
}
