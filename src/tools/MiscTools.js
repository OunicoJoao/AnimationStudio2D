/**
 * Texto, mão (mover a vista) e zoom.
 * @module tools/MiscTools
 */
import { Tool } from './Tool.js';
import { createCanvas } from '../render/canvas.js';
import { rgbaToCss } from '../core/color.js';

export const TEXT_FONTS = {
  Figtree: 'Figtree, system-ui, sans-serif',
  'Bricolage Grotesque': '"Bricolage Grotesque", system-ui, sans-serif',
  Serifada: 'Georgia, "Times New Roman", serif',
  Manuscrita: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
  Monoespaçada: 'ui-monospace, Consolas, monospace',
};

/** Rasteriza um texto multilinha num canvas justo. */
export function renderText(text, { font, size, bold, italic, align, color }) {
  const family = TEXT_FONTS[font] || TEXT_FONTS.Figtree;
  const css = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${size}px ${family}`;
  const lines = String(text).split('\n');
  const probe = createCanvas(1, 1).getContext('2d');
  probe.font = css;
  const lh = Math.round(size * 1.25);
  const widths = lines.map((l) => probe.measureText(l).width);
  const pad = Math.ceil(size * 0.3);
  const w = Math.ceil(Math.max(1, ...widths)) + pad * 2, h = lh * lines.length + pad * 2;
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.font = css;
  g.textBaseline = 'middle';
  g.fillStyle = rgbaToCss(color);
  lines.forEach((l, i) => {
    const x = align === 'center' ? (w - widths[i]) / 2 : align === 'right' ? w - pad - widths[i] : pad;
    g.fillText(l, x, pad + lh * i + lh / 2);
  });
  return c;
}

export class TextTool extends Tool {
  static id = 'text';
  static label = 'Texto';
  static icon = 'text';
  static key = 'T';
  static hint = 'Toque onde o texto deve começar';
  get cursor() { return 'text'; }

  async down(e) {
    const { paint, ui, settings, colors, float, tools } = this.ctx;
    if (!paint.canPaint()) return;
    const res = await ui.textDialog(settings.get('text'));
    if (!res || !res.text.trim()) return;
    settings.patch('text', { font: res.font, size: res.size, bold: res.bold, italic: res.italic, align: res.align });
    const c = renderText(res.text, { ...res, color: colors.fg });
    float.paste(c, Math.round(e.x), Math.round(e.y - c.height / 2), 'Texto');
    tools.select('transform');
  }

  options() {
    return [
      { type: 'select', key: 'text.font', label: 'Fonte', options: Object.keys(TEXT_FONTS).map((f) => ({ value: f, label: f })) },
      { type: 'slider', key: 'text.size', label: 'Tamanho', min: 8, max: 400, step: 1, unit: 'px', log: true },
    ];
  }
}

export class HandTool extends Tool {
  static id = 'hand';
  static label = 'Mão';
  static icon = 'hand';
  static key = 'H';
  static hint = 'Arraste para mover a vista. Atalho: segure Espaço';
  get cursor() { return this.drag ? 'grabbing' : 'grab'; }
  get keepsFloating() { return true; }

  down(e) { this.drag = { x: e.sx, y: e.sy }; }
  move(e) {
    if (!this.drag) return;
    this.ctx.viewport.panBy(e.sx - this.drag.x, e.sy - this.drag.y);
    this.drag = { x: e.sx, y: e.sy };
  }
  up() { this.drag = null; }
  cancel() { this.drag = null; }
}

export class ZoomTool extends Tool {
  static id = 'zoom';
  static label = 'Zoom';
  static icon = 'zoom';
  static key = 'Z';
  static hint = 'Clique aproxima, Alt+clique afasta, arraste para os lados para ajustar';
  get cursor() { return 'zoom-in'; }
  get keepsFloating() { return true; }

  down(e) { this.drag = { x: e.sx, sx: e.sx, sy: e.sy, z: this.ctx.viewport.zoom, alt: e.alt, moved: false }; }
  move(e) {
    const d = this.drag;
    if (!d) return;
    const dx = e.sx - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved) this.ctx.viewport.zoomAt(d.z * Math.pow(2, dx / 150), d.sx, d.sy);
  }
  up(e) {
    const d = this.drag;
    this.drag = null;
    if (d && !d.moved) this.ctx.viewport.zoomStep(d.alt || e.alt ? -1 : 1, e.sx, e.sy);
  }
  cancel() { this.drag = null; }
}
