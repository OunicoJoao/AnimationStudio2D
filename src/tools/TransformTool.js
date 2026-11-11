/**
 * Mover e transformar: arraste para mover, cantos para escalar, alça redonda para girar.
 * Age na seleção atual ou na camada inteira. Enter aplica, Esc cancela.
 * @module tools/TransformTool
 */
import { Tool } from './Tool.js';
import { Mat, deg2rad } from '../core/math.js';

const HANDLE_SIGNS = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]];

export class TransformTool extends Tool {
  static id = 'transform';
  static label = 'Mover e transformar';
  static icon = 'transform';
  static key = 'V';
  static hint = 'Cantos escalam (Shift = livre), alça redonda gira (Shift = 15°), setas movem 1 px';
  get keepsFloating() { return true; }
  get cursor() { return 'move'; }

  activate() {
    if (!this.ctx.ws.floating && this.ctx.ws.project) this.ctx.float.lift();
    this.render();
  }

  /** Geometria das alças em px de tela. */
  #handles() {
    const fl = this.ctx.ws.floating;
    if (!fl) return null;
    const vp = this.ctx.viewport;
    const c = fl.corners.map(([x, y]) => vp.toScreen(x, y));
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const pts = [c[0], c[1], c[2], c[3], mid(c[0], c[1]), mid(c[1], c[2]), mid(c[2], c[3]), mid(c[3], c[0])];
    const center = mid(c[0], c[2]);
    const top = pts[4];
    let nx = top.x - center.x, ny = top.y - center.y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    // se o flutuante estiver espelhado verticalmente a alça continua "para fora"
    const rot = { x: top.x + nx * 30, y: top.y + ny * 30 };
    return { c, pts, center, rot, top };
  }

  #hit(sx, sy, touch) {
    const h = this.#handles();
    if (!h) return null;
    const r = touch ? 22 : 11;
    if (Math.hypot(sx - h.rot.x, sy - h.rot.y) <= r + 2) return { kind: 'rotate' };
    for (let i = 0; i < 8; i++) if (Math.hypot(sx - h.pts[i].x, sy - h.pts[i].y) <= r) return { kind: 'scale', i };
    if (pointInPoly(sx, sy, h.c)) return { kind: 'move' };
    return { kind: 'rotate' };
  }

  down(e) {
    const { ws, float } = this.ctx;
    if (!ws.floating && !float.lift()) return;
    const fl = ws.floating;
    const hit = this.#hit(e.sx, e.sy, e.pointerType === 'touch');
    this.drag = { hit, x0: e.x, y0: e.y, start: { tx: fl.tx, ty: fl.ty, sx: fl.sx, sy: fl.sy, rot: fl.rot } };
  }

  move(e) {
    const fl = this.ctx.ws.floating;
    if (!this.drag || !fl) { this.hoverKind = fl ? this.#hit(e.sx, e.sy, e.pointerType === 'touch')?.kind : null; return; }
    const { hit, x0, y0, start } = this.drag;
    const cx0 = fl.x + fl.w / 2 + start.tx, cy0 = fl.y + fl.h / 2 + start.ty;
    if (hit.kind === 'move') {
      fl.tx = start.tx + (e.x - x0);
      fl.ty = start.ty + (e.y - y0);
      if (e.shift) { if (Math.abs(fl.tx - start.tx) > Math.abs(fl.ty - start.ty)) fl.ty = start.ty; else fl.tx = start.tx; }
    } else if (hit.kind === 'rotate') {
      const a0 = Math.atan2(y0 - cy0, x0 - cx0), a1 = Math.atan2(e.y - cy0, e.x - cx0);
      let r = start.rot + (a1 - a0);
      if (e.shift) r = Math.round(r / deg2rad(15)) * deg2rad(15);
      fl.rot = r;
    } else {
      const [hx0, hy0] = HANDLE_SIGNS[hit.i];
      const hxs = hx0 * Math.sign(start.sx || 1), hys = hy0 * Math.sign(start.sy || 1);
      // ponteiro no referencial girado, relativo ao centro inicial
      const inv = Mat.invert(Mat.chain(Mat.translate(cx0, cy0), Mat.rotate(start.rot)));
      const [u, v] = Mat.apply(inv, e.x, e.y);
      const hw = (fl.w * Math.abs(start.sx)) / 2, hh = (fl.h * Math.abs(start.sy)) / 2;
      const oppX = -hxs * hw, oppY = -hys * hh;
      let nw = hxs ? (u - oppX) * hxs : hw * 2;
      let nh = hys ? (v - oppY) * hys : hh * 2;
      const corner = hxs && hys;
      if (corner && !e.shift) {
        const k = ((nw / (hw * 2 || 1)) + (nh / (hh * 2 || 1))) / 2;
        nw = hw * 2 * k; nh = hh * 2 * k;
      }
      const minS = 1 / Math.max(fl.w, fl.h);
      const sxNew = Math.sign(start.sx || 1) * (nw / fl.w), syNew = Math.sign(start.sy || 1) * (nh / fl.h);
      fl.sx = Math.abs(sxNew) < minS ? minS * Math.sign(sxNew || 1) : sxNew;
      fl.sy = Math.abs(syNew) < minS ? minS * Math.sign(syNew || 1) : syNew;
      // novo centro: o canto/borda oposto fica parado
      const ncx = hxs ? oppX + (hxs * nw) / 2 : 0, ncy = hys ? oppY + (hys * nh) / 2 : 0;
      const [dx, dy] = Mat.apply(Mat.rotate(start.rot), ncx, ncy);
      fl.tx = start.tx + dx;
      fl.ty = start.ty + dy;
    }
    this.ctx.ws.changed('floating');
  }

  up() { this.drag = null; }
  cancel() { this.drag = null; }
  hover(e) { this.move(e); }

  key(e) {
    const fl = this.ctx.ws.floating;
    if (e.key === 'Enter') { this.ctx.float.commit(); return true; }
    if (e.key === 'Escape') { this.ctx.float.cancel(); return true; }
    if (!fl) return false;
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d) { fl.tx += d[0]; fl.ty += d[1]; this.ctx.ws.changed('floating'); return true; }
    return false;
  }

  get cursorFor() { return this.hoverKind === 'move' ? 'move' : this.hoverKind === 'scale' ? 'nwse-resize' : this.hoverKind === 'rotate' ? 'grab' : 'default'; }

  /** Ações rápidas da barra de opções. */
  flip(axis) {
    const fl = this.ctx.ws.floating || this.ctx.float.lift();
    if (!fl) return;
    if (axis === 'h') fl.sx *= -1; else fl.sy *= -1;
    this.ctx.ws.changed('floating');
  }

  rotate90(dir = 1) {
    const fl = this.ctx.ws.floating || this.ctx.float.lift();
    if (!fl) return;
    fl.rot += (dir * Math.PI) / 2;
    this.ctx.ws.changed('floating');
  }

  drawOverlay(g) {
    const h = this.#handles();
    if (!h) return;
    g.save();
    g.beginPath();
    h.c.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
    g.closePath();
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#1d1d1f'; g.stroke();
    g.beginPath(); g.moveTo(h.top.x, h.top.y); g.lineTo(h.rot.x, h.rot.y); g.stroke();
    for (const q of h.pts) {
      g.beginPath();
      g.rect(q.x - 5.5, q.y - 5.5, 11, 11);
      g.fillStyle = '#fff'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = '#1d1d1f'; g.stroke();
    }
    g.beginPath();
    g.arc(h.rot.x, h.rot.y, 7, 0, Math.PI * 2);
    g.fillStyle = '#f6cf6e'; g.fill(); g.stroke();
    g.restore();
  }

  options() {
    const has = () => !!this.ctx.ws.floating;
    return [
      { type: 'button', label: 'Espelhar ↔', icon: 'flipH', action: () => this.flip('h') },
      { type: 'button', label: 'Espelhar ↕', icon: 'flipV', action: () => this.flip('v') },
      { type: 'button', label: 'Girar 90°', icon: 'rotateRight', action: () => this.rotate90(1) },
      { type: 'button', label: 'Aplicar', icon: 'check', primary: true, action: () => this.ctx.float.commit(), disabled: () => !has() },
      { type: 'button', label: 'Cancelar', icon: 'close', action: () => this.ctx.float.cancel(), disabled: () => !has() },
    ];
  }
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
