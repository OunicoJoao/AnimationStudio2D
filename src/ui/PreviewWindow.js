/**
 * Janela flutuante de prévia: toca a animação em miniatura, sem interromper o desenho.
 * Pode ser arrastada pelo cabeçalho.
 * @module ui/PreviewWindow
 */
import { h, icon, iconButton, drag, clear } from './dom.js';
import { renderFrame } from '../render/Compositor.js';
import { createCanvas } from '../render/canvas.js';
import { playOrder } from '../app/Playback.js';

export class PreviewWindow {
  constructor(host, { ws, settings }) {
    Object.assign(this, { host, ws, settings });
    this.canvas = h('canvas.pv-canvas');
    this.tmp = createCanvas(1, 1);
    this.playBtn = iconButton('pause', 'Pausar prévia', () => this.toggle(), 'sm');
    const head = h('div.pv-head', h('span', 'Prévia'), this.playBtn, iconButton('close', 'Fechar prévia', () => settings.set('preview', false), 'sm'));
    this.el = h('div.pv', { hidden: true, role: 'region', 'aria-label': 'Prévia da animação' }, head, this.canvas);
    host.append(this.el);
    this.playing = true;
    this.pos = 0;
    let ox = 0, oy = 0;
    drag(head, {
      start: (e) => { if (e.target.closest('button')) return false; const r = this.el.getBoundingClientRect(), hr = host.getBoundingClientRect(); ox = r.left - hr.left; oy = r.top - hr.top; },
      move: (e, dx, dy) => { this.el.style.left = `${Math.max(0, ox + dx)}px`; this.el.style.top = `${Math.max(0, oy + dy)}px`; this.el.style.right = 'auto'; },
    });
    settings.on('change', ({ path }) => { if (path === 'preview') this.sync(); });
    this.sync();
  }

  sync() {
    const on = !!this.settings.get('preview');
    this.el.hidden = !on;
    clearTimeout(this.timer);
    if (on) this.#tick();
  }

  toggle() {
    this.playing = !this.playing;
    clear(this.playBtn).append(icon(this.playing ? 'pause' : 'play'));
    this.playBtn.title = this.playing ? 'Pausar prévia' : 'Tocar prévia';
    if (this.playing) this.#tick();
  }

  #tick() {
    clearTimeout(this.timer);
    const p = this.ws.project;
    if (!p || this.el.hidden) return;
    const order = playOrder(0, p.frames.length - 1, 'forward');
    if (!this.playing) this.pos = this.ws.frameIndex;
    else this.pos = this.pos % order.length;
    const fi = order[this.pos] ?? 0;
    const maxW = 220;
    const s = Math.min(maxW / p.width, 160 / p.height);
    const c = renderFrame(p, fi, { scale: s, target: this.tmp });
    if (this.canvas.width !== c.width || this.canvas.height !== c.height) { this.canvas.width = c.width; this.canvas.height = c.height; }
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(c, 0, 0);
    if (this.playing) {
      this.pos++;
      this.timer = setTimeout(() => this.#tick(), p.frameDurationMs(fi));
    }
  }
}
