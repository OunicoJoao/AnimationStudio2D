/**
 * Pincel e borracha: traço suave com pressão, estabilizador e simetria.
 * @module tools/BrushTool
 */
import { Tool } from './Tool.js';
import { BrushEngine } from '../brush/BrushEngine.js';
import { BRUSH_PRESETS, ERASER_PRESETS } from '../brush/presets.js';
import { symmetryMatrices } from '../brush/Symmetry.js';
import { SYMMETRY_OPTION } from './common.js';

const engine = new BrushEngine();

export class BrushTool extends Tool {
  static id = 'brush';
  static label = 'Pincel';
  static icon = 'brush';
  static key = 'B';
  static hint = 'Shift+clique liga ao último ponto com uma reta';

  /** Grupo de preferências e conjunto de pincéis. */
  get group() { return 'brush'; }
  get presets() { return BRUSH_PRESETS; }
  get mode() { return 'paint'; }
  get paints() { return true; }
  get cursor() { return 'none'; }

  constructor(ctx) {
    super(ctx);
    this.stroke = null;
    this.hoverPt = null;
    this.lastPoint = null;
  }

  get opts() { return this.ctx.settings.get(this.group); }
  get preset() { return this.presets[this.opts.preset] || Object.values(this.presets)[0]; }

  down(e) {
    const { paint, ws, colors, stage, viewport, settings } = this.ctx;
    if (!paint.canPaint()) return;
    const o = this.opts;
    const canvas = paint.freshStrokeCanvas();
    const g = canvas.getContext('2d');
    const p = ws.project;
    const straight = e.shift && this.lastPoint && this.lastPoint.layerId === ws.layerId;
    const start = straight ? this.lastPoint : { x: e.x, y: e.y, p: e.p };
    const opacity = (o.opacity / 100) * (this.mode === 'paint' ? colors.fg[3] / 255 : 1) * this.preset.opacity;
    engine.begin({
      ctx: g, preset: this.preset, size: o.size,
      color: this.mode === 'erase' ? [0, 0, 0, 255] : colors.fg,
      usePressure: o.pressure && e.pointerType === 'pen',
      stabilize: straight ? 0 : o.stabilize / 100,
      viewScale: 1 / viewport.zoom,
      matrices: symmetryMatrices(settings.get('symmetry'), p.width / 2, p.height / 2),
      start,
    });
    this.stroke = { canvas, opacity };
    stage.toolPreview = paint.previewFor(canvas, { opacity, mode: this.mode });
    if (straight) engine.point({ x: e.x, y: e.y, p: e.p });
    this.render();
  }

  move(e) {
    this.hoverPt = { x: e.sx, y: e.sy };
    if (!this.stroke) return this.render();
    engine.point({ x: e.x, y: e.y, p: e.p });
    this.render();
  }

  up(e) {
    if (!this.stroke) return;
    const { paint, stage, colors, ws } = this.ctx;
    const bounds = engine.end();
    const { canvas, opacity } = this.stroke;
    this.stroke = null;
    stage.toolPreview = null;
    paint.commitStroke(canvas, bounds, { opacity, mode: this.mode, label: this.mode === 'erase' ? 'Borracha' : this.preset.name });
    if (this.mode === 'paint') colors.remember();
    this.lastPoint = { x: e.x, y: e.y, p: e.p, layerId: ws.layerId };
    this.render();
  }

  hover(e) { this.hoverPt = e.pointerType === 'touch' ? null : { x: e.sx, y: e.sy }; this.render(); }
  leave() { this.hoverPt = null; this.render(); }

  cancel() {
    if (!this.stroke) return;
    engine.end();
    this.stroke = null;
    this.ctx.stage.toolPreview = null;
    this.render();
  }

  key(e) {
    // [ e ] mudam o tamanho do pincel
    if (e.key === '[' || e.key === ']') {
      const s = this.opts.size;
      const next = e.key === ']' ? Math.min(500, Math.ceil(s * 1.15 + 0.5)) : Math.max(1, Math.floor(s / 1.15));
      this.ctx.settings.set(`${this.group}.size`, next);
      this.render();
      return true;
    }
    return false;
  }

  drawOverlay(g) {
    const h = this.hoverPt;
    if (!h) return;
    const r = Math.max(1.5, (this.opts.size * this.ctx.viewport.zoom) / 2);
    g.beginPath();
    g.arc(h.x, h.y, r, 0, Math.PI * 2);
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(20,20,20,.9)';
    g.stroke();
    if (r < 4) {
      g.beginPath();
      g.moveTo(h.x - 6, h.y); g.lineTo(h.x - 3, h.y); g.moveTo(h.x + 3, h.y); g.lineTo(h.x + 6, h.y);
      g.moveTo(h.x, h.y - 6); g.lineTo(h.x, h.y - 3); g.moveTo(h.x, h.y + 3); g.lineTo(h.x, h.y + 6);
      g.stroke();
    }
  }

  options() {
    const grp = this.group;
    return [
      { type: 'segmented', key: `${grp}.preset`, label: this.mode === 'erase' ? 'Borracha' : 'Pincel', options: Object.entries(this.presets).map(([value, p]) => ({ value, label: p.name, icon: p.icon })) },
      { type: 'slider', key: `${grp}.size`, label: 'Tamanho', min: 1, max: 500, step: 1, unit: 'px', log: true },
      { type: 'slider', key: `${grp}.opacity`, label: 'Opacidade', min: 1, max: 100, step: 1, unit: '%' },
      { type: 'slider', key: `${grp}.stabilize`, label: 'Suavizar', min: 0, max: 100, step: 1, unit: '%' },
      { type: 'toggle', key: `${grp}.pressure`, label: 'Pressão', icon: 'pressure' },
      SYMMETRY_OPTION,
    ];
  }
}

export class EraserTool extends BrushTool {
  static id = 'eraser';
  static label = 'Borracha';
  static icon = 'eraser';
  static key = 'E';
  static hint = 'Shift+clique apaga em linha reta';
  get group() { return 'eraser'; }
  get presets() { return ERASER_PRESETS; }
  get mode() { return 'erase'; }
}
