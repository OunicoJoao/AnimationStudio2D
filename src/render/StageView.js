/**
 * Área de desenho na tela: papel, onion skin, quadro composto, grade, guias de simetria,
 * seleção e camadas de sobreposição das ferramentas. Redesenha sob demanda (rAF).
 * @module render/StageView
 */
import { FrameCompositor, OnionCache } from './Compositor.js';
import { checkerPattern } from './canvas.js';
import { symmetryMatrices } from '../brush/Symmetry.js';
import { Mat } from '../core/math.js';

/**
 * @typedef {object} Overlay
 * @property {(g: CanvasRenderingContext2D, stage: StageView) => void} drawOverlay  desenha em px de tela
 */

export class StageView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} deps
   * @param {import('../app/Workspace.js').Workspace} deps.ws
   * @param {import('./Viewport.js').Viewport} deps.viewport
   * @param {import('../app/Settings.js').Settings} deps.settings
   */
  constructor(canvas, { ws, viewport, settings }) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.ws = ws;
    this.viewport = viewport;
    this.settings = settings;
    this.compositor = new FrameCompositor();
    this.onion = new OnionCache();
    /** @type {import('./Compositor.js').LayerPreview|null} */
    this.toolPreview = null;
    /** @type {Overlay[]} */
    this.overlays = [];
    this.playing = false;
    this.dpr = 1;
    this.antsPhase = 0;
    this.colors = { stage: '#e9e8e4', line: '#1d1d1f', shadow: 'rgba(29,29,31,.9)', guide: '#6ec6f0', grid: 'rgba(0,0,0,.12)' };
    this.#pending = false;

    const ro = new ResizeObserver(() => this.#resize());
    ro.observe(canvas.parentElement);
    this.#resize();
    viewport.on('change', () => this.requestRender());
    ws.on('change', () => this.requestRender());
    settings.on('change', ({ path }) => { if (/^(onion|grid|symmetry|theme)/.test(path)) this.requestRender(); });
    this.#antsTimer = setInterval(() => {
      if (this.ws.selection || this.ws.floating) { this.antsPhase = (this.antsPhase + 1) % 16; this.requestRender(); }
    }, 110);
  }

  #pending;
  #antsTimer;

  /** Lê as cores do tema atual (variáveis CSS). */
  refreshTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    this.colors = {
      stage: v('--stage', '#e9e8e4'),
      line: v('--ink', '#1d1d1f'),
      shadow: v('--paper-shadow', 'rgba(29,29,31,.9)'),
      guide: v('--sky', '#6ec6f0'),
      grid: v('--grid', 'rgba(0,0,0,.12)'),
      accent: v('--butter', '#f6cf6e'),
    };
    this.requestRender();
  }

  #resize() {
    const parent = this.canvas.parentElement;
    const r = parent.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    const first = this.viewport.screenW <= 1;
    const dx = (w - this.viewport.screenW) / 2, dy = (h - this.viewport.screenH) / 2;
    this.viewport.setScreenSize(w, h);
    if (first) this.viewport.fit();
    else { this.viewport.panX += dx; this.viewport.panY += dy; }
    this.requestRender();
  }

  requestRender() {
    if (this.#pending) return;
    this.#pending = true;
    requestAnimationFrame(() => { this.#pending = false; this.draw(); });
  }

  /** Pré-visualização ativa na camada atual (ferramenta + conteúdo flutuante). */
  #preview() {
    const ws = this.ws, tool = this.toolPreview, fl = ws.floating;
    if (!tool && !fl) return null;
    const layerId = fl?.layerId ?? tool.layerId;
    const frameId = fl?.frameId ?? tool.frameId;
    return {
      layerId, frameId,
      apply: (g) => {
        if (fl) fl.drawTo(g);
        if (tool && tool.layerId === layerId && tool.frameId === frameId) tool.apply(g);
      },
    };
  }

  draw() {
    const { g, viewport: vp, ws } = this;
    const p = ws.project;
    const dpr = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.colors.stage;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!p) return;
    vp.setDocSize(p.width, p.height);
    const m = Mat.multiply(Mat.scale(dpr), vp.matrix);
    const corners = [[0, 0], [p.width, 0], [p.width, p.height], [0, p.height]].map(([x, y]) => Mat.apply(m, x, y));

    // sombra dura e contorno do papel (estilo adesivo)
    g.beginPath();
    corners.forEach(([x, y], i) => (i ? g.lineTo(x + 5 * dpr, y + 5 * dpr) : g.moveTo(x + 5 * dpr, y + 5 * dpr)));
    g.closePath();
    g.fillStyle = this.colors.shadow;
    g.fill();

    g.setTransform(...m);
    g.imageSmoothingEnabled = vp.zoom < 3;
    g.imageSmoothingQuality = 'high';
    if (p.background) {
      g.fillStyle = p.background;
      g.fillRect(0, 0, p.width, p.height);
    } else {
      g.save();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.beginPath();
      corners.forEach(([x, y], i) => (i ? g.lineTo(x / dpr, y / dpr) : g.moveTo(x / dpr, y / dpr)));
      g.closePath();
      g.fillStyle = checkerPattern(g, 10);
      g.fill();
      g.restore();
      g.setTransform(...m);
    }

    const fi = ws.frameIndex;
    if (!this.playing) this.#drawOnion(g, p, fi);
    const composite = this.compositor.compose(p, fi, this.#preview());
    g.drawImage(composite, 0, 0);

    // contorno do papel
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.lineWidth = 1.5 * dpr;
    g.strokeStyle = this.colors.line;
    g.stroke();

    if (!this.playing) {
      this.#drawGrid(g, p, m);
      this.#drawSymmetry(g, p, m);
      this.#drawSelection(g, m);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const o of this.overlays) o.drawOverlay?.(g, this);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  #drawOnion(g, p, fi) {
    const o = this.settings.get('onion');
    if (!o.on || p.frames.length < 2) return;
    // resolução reduzida quando a vista está longe: mais rápido e igual na tela
    const scale = Math.min(1, Math.max(0.25, this.viewport.zoom * this.dpr));
    const draw = (idx, dist, color) => {
      let i = idx;
      if (p.loop && p.frames.length > 2) i = (idx + p.frames.length) % p.frames.length;
      if (i < 0 || i >= p.frames.length || i === fi) return;
      const c = this.onion.get(p, i, o.tint ? color : null, scale);
      g.globalAlpha = o.opacity * Math.pow(0.6, dist - 1);
      g.drawImage(c, 0, 0, p.width, p.height);
    };
    for (let d = o.before; d >= 1; d--) draw(fi - d, d, o.beforeColor);
    for (let d = o.after; d >= 1; d--) draw(fi + d, d, o.afterColor);
    g.globalAlpha = 1;
  }

  #drawGrid(g, p, m) {
    const grid = this.settings.get('grid');
    if (!grid.on) return;
    const step = Math.max(4, grid.size);
    if (step * this.viewport.zoom < 6) return;
    g.save();
    g.setTransform(...m);
    g.beginPath();
    for (let x = step; x < p.width; x += step) { g.moveTo(x, 0); g.lineTo(x, p.height); }
    for (let y = step; y < p.height; y += step) { g.moveTo(0, y); g.lineTo(p.width, y); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineWidth = 1;
    g.strokeStyle = this.colors.grid;
    g.stroke();
    g.restore();
  }

  #drawSymmetry(g, p, m) {
    const sym = this.settings.get('symmetry');
    if (!sym || sym.mode === 'none') return;
    const cx = p.width / 2, cy = p.height / 2;
    const lines = [];
    if (sym.mode === 'vertical' || sym.mode === 'both') lines.push([cx, 0, cx, p.height]);
    if (sym.mode === 'horizontal' || sym.mode === 'both') lines.push([0, cy, p.width, cy]);
    if (sym.mode === 'radial') {
      const r = Math.hypot(p.width, p.height);
      for (const mm of symmetryMatrices(sym, cx, cy)) {
        const [x, y] = Mat.apply(mm, cx, cy - r);
        lines.push([cx, cy, x, y]);
      }
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    for (const [x0, y0, x1, y1] of lines) {
      const a = Mat.apply(m, x0, y0), b = Mat.apply(m, x1, y1);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.setLineDash([8 * this.dpr, 6 * this.dpr]);
    g.lineWidth = 1.5 * this.dpr;
    g.strokeStyle = this.colors.guide;
    g.stroke();
    g.restore();
  }

  #drawSelection(g, m) {
    const ws = this.ws;
    let sel = ws.selection;
    let mm = m;
    if (ws.floating?.selection) { sel = ws.floating.selection; mm = Mat.multiply(m, ws.floating.deltaMatrix); }
    if (!sel) return;
    const segs = sel.outline;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      const a = Mat.apply(mm, segs[i], segs[i + 1]), b = Mat.apply(mm, segs[i + 2], segs[i + 3]);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.lineWidth = 1 * this.dpr;
    g.strokeStyle = '#fff';
    g.stroke();
    g.setLineDash([5 * this.dpr, 5 * this.dpr]);
    g.lineDashOffset = -this.antsPhase * this.dpr * 0.6;
    g.strokeStyle = '#111';
    g.stroke();
    g.restore();
  }

  /** Coordenadas do evento relativas ao canvas (px CSS). */
  eventPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}
