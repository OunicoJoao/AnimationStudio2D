/**
 * Seleção (retângulo, elipse, laço), varinha mágica e conta-gotas.
 * @module tools/SelectTools
 */
import { Tool } from './Tool.js';
import { Selection } from '../model/Selection.js';
import { floodMask } from '../raster/flood.js';
import { renderFrame } from '../render/Compositor.js';
import { Rect, squareFrom } from '../core/math.js';
import { hexToRgba } from '../core/color.js';
import { selModeFrom } from './common.js';

export class SelectTool extends Tool {
  static id = 'select';
  static label = 'Seleção';
  static icon = 'selectRect';
  static key = 'M';
  static hint = 'Shift soma, Alt subtrai; toque sem arrastar para desmarcar';

  down(e) {
    if (!this.ctx.ws.project) return;
    this.mode = selModeFrom(e);
    this.kind = this.ctx.settings.get('select.kind');
    this.a = { x: e.x, y: e.y, sx: e.sx, sy: e.sy };
    this.b = { ...this.a };
    this.pts = [{ x: e.x, y: e.y }];
    this.render();
  }

  move(e) {
    if (!this.a) return;
    let { x, y } = e;
    if (e.shift && this.kind !== 'lasso' && this.mode === 'replace') [x, y] = squareFrom(this.a.x, this.a.y, x, y);
    this.b = { x, y, sx: e.sx, sy: e.sy };
    if (this.kind === 'lasso') {
      const l = this.pts.at(-1);
      if (Math.hypot(e.x - l.x, e.y - l.y) * this.ctx.viewport.zoom >= 2) this.pts.push({ x: e.x, y: e.y });
    }
    this.render();
  }

  up() {
    if (!this.a) return;
    const { ws } = this.ctx;
    const p = ws.project;
    const tiny = Math.hypot(this.b.sx - this.a.sx, this.b.sy - this.a.sy) < 4;
    const { a, b, pts, kind, mode } = this;
    this.a = null;
    if (tiny) {
      if (mode === 'replace') ws.setSelection(null);
      return this.render();
    }
    let sel;
    if (kind === 'lasso') sel = pts.length > 2 ? Selection.fromPolygon(pts, p.width, p.height) : null;
    else {
      const r = Rect.fromPoints(a.x, a.y, b.x, b.y);
      sel = kind === 'ellipse' ? Selection.fromEllipse(r, p.width, p.height) : Selection.fromRect(Rect.roundOut(r), p.width, p.height);
    }
    if (!sel || sel.isEmpty) return this.render();
    ws.setSelection(ws.selection ? ws.selection.combine(sel, mode) : (mode === 'subtract' || mode === 'intersect' ? null : sel));
  }

  cancel() { this.a = null; this.render(); }

  drawOverlay(g) {
    if (!this.a) return;
    const vp = this.ctx.viewport;
    g.beginPath();
    if (this.kind === 'lasso') {
      this.pts.forEach((q, i) => { const s = vp.toScreen(q.x, q.y); return i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); });
      const s = vp.toScreen(this.b.x, this.b.y);
      g.lineTo(s.x, s.y);
      g.closePath();
    } else {
      const r = Rect.fromPoints(this.a.x, this.a.y, this.b.x, this.b.y);
      const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => vp.toScreen(x, y));
      if (this.kind === 'ellipse') {
        const c = vp.toScreen(r.x + r.w / 2, r.y + r.h / 2);
        g.ellipse(c.x, c.y, (r.w / 2) * vp.zoom, (r.h / 2) * vp.zoom, (vp.rotation * Math.PI) / 180, 0, Math.PI * 2);
      } else {
        corners.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        g.closePath();
      }
    }
    g.fillStyle = 'rgba(110,198,240,.14)';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = '#fff';
    g.stroke();
    g.setLineDash([5, 4]);
    g.strokeStyle = '#111';
    g.stroke();
    g.setLineDash([]);
  }

  options() {
    const ws = this.ctx.ws;
    return [
      { type: 'segmented', key: 'select.kind', label: 'Forma', options: [
        { value: 'rect', label: 'Retângulo', icon: 'selectRect' },
        { value: 'ellipse', label: 'Elipse', icon: 'selectEllipse' },
        { value: 'lasso', label: 'Laço', icon: 'lasso' },
      ] },
      { type: 'button', label: 'Tudo', icon: 'selectAll', action: () => this.ctx.ui.run('selectAll') },
      { type: 'button', label: 'Inverter', icon: 'invertSel', action: () => this.ctx.ui.run('invertSelection'), disabled: () => !ws.selection },
      { type: 'button', label: 'Desmarcar', icon: 'deselect', action: () => this.ctx.ui.run('deselect'), disabled: () => !ws.selection },
      { type: 'button', label: 'Transformar', icon: 'transform', action: () => this.ctx.ui.run('transform'), disabled: () => !ws.selection },
    ];
  }
}

export class WandTool extends Tool {
  static id = 'wand';
  static label = 'Varinha mágica';
  static icon = 'wand';
  static key = 'W';
  static hint = 'Seleciona áreas de cor parecida; Shift soma, Alt subtrai';

  down(e) {
    const { ws, settings, toast } = this.ctx;
    const p = ws.project;
    if (!p) return;
    const o = settings.get('wand');
    const src = o.sample === 'all' ? renderFrame(p, ws.frameIndex, { background: false }) : p.getCel(ws.layerId, ws.frameId);
    const px = src ? src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, p.width, p.height).data : new Uint8ClampedArray(p.width * p.height * 4);
    const m = floodMask(px, p.width, p.height, e.x, e.y, { tolerance: Math.round((o.tolerance / 100) * 255), contiguous: o.contiguous });
    const sel = Selection.fromBinary(m, p.width, p.height);
    if (sel.isEmpty) { toast('Nada selecionado aqui.'); return; }
    const mode = selModeFrom(e);
    ws.setSelection(ws.selection ? ws.selection.combine(sel, mode) : sel);
  }

  options() {
    return [
      { type: 'slider', key: 'wand.tolerance', label: 'Tolerância', min: 0, max: 100, step: 1, unit: '%' },
      { type: 'segmented', key: 'wand.sample', label: 'Olhar', options: [{ value: 'layer', label: 'Só esta camada' }, { value: 'all', label: 'Todas as camadas' }] },
      { type: 'toggle', key: 'wand.contiguous', label: 'Só áreas ligadas', icon: 'contiguous' },
    ];
  }
}

export class EyedropperTool extends Tool {
  static id = 'eyedropper';
  static label = 'Conta-gotas';
  static icon = 'eyedropper';
  static key = 'I';
  static hint = 'Pega a cor da tela. Atalho: segure Alt ou toque e segure com o dedo';

  /** Lê a cor visível num ponto do documento. */
  sample(x, y) {
    const { ws, stage } = this.ctx;
    const p = ws.project;
    x = Math.floor(x); y = Math.floor(y);
    if (!p || x < 0 || y < 0 || x >= p.width || y >= p.height) return null;
    const comp = stage.compositor.compose(p, ws.frameIndex, null);
    const d = comp.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    const a = d[3] / 255;
    const bg = p.background ? hexToRgba(p.background) : null;
    if (!bg) return a ? [d[0], d[1], d[2], 255] : null;
    // mistura com o papel, como aparece na tela
    return [0, 1, 2].map((k) => Math.round(d[k] * a + bg[k] * (1 - a))).concat(255);
  }

  down(e) { this.#pick(e); this.picking = true; }
  move(e) { if (this.picking) this.#pick(e); }
  up() { this.picking = false; this.ctx.colors.remember(); }

  #pick(e) {
    const c = this.sample(e.x, e.y);
    if (!c) return;
    if (e.button === 2) this.ctx.colors.setBg(c); else this.ctx.colors.setFg(c);
    this.last = { sx: e.sx, sy: e.sy, c };
    this.render();
  }

  drawOverlay(g) {
    if (!this.picking || !this.last) return;
    const { sx, sy, c } = this.last;
    g.beginPath();
    g.arc(sx, sy - 56, 26, 0, Math.PI * 2);
    g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    g.fill();
    g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#111'; g.stroke();
  }
}
