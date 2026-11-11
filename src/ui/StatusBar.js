/**
 * Barra de status: zoom, rotação, posição do cursor, tamanho e dica da ferramenta.
 * @module ui/StatusBar
 */
import { h, iconButton } from './dom.js';

export class StatusBar {
  constructor(root, { ws, viewport, tools, commands }) {
    Object.assign(this, { root, ws, viewport, tools, commands });
    this.zoomEl = h('button.status-zoom', { type: 'button', title: 'Ajustar à tela (Ctrl+0)', onclick: () => commands.run('zoomFit') });
    this.rotEl = h('button.status-rot', { type: 'button', title: 'Endireitar a vista', onclick: () => commands.run('rotateViewReset') });
    this.posEl = h('span.status-pos');
    this.sizeEl = h('span.status-size');
    this.hintEl = h('span.status-hint');
    root.append(
      iconButton('minus', 'Afastar (-)', () => commands.run('zoomOut'), 'sm'),
      this.zoomEl,
      iconButton('plus', 'Aproximar (+)', () => commands.run('zoomIn'), 'sm'),
      this.rotEl, this.posEl, this.sizeEl, this.hintEl);
    viewport.on('change', () => this.renderView());
    tools.on('change', () => this.renderHint());
    ws.on('change', ({ kind }) => { if (kind === 'project' || kind === 'all') this.renderSize(); });
    this.renderView();
    this.renderHint();
  }

  renderView() {
    const v = this.viewport;
    this.zoomEl.textContent = `${Math.round(v.zoom * 100)}%`;
    this.rotEl.hidden = !v.rotation && !v.flipX;
    this.rotEl.textContent = `${v.flipX ? '⇋ ' : ''}${Math.round(v.rotation)}°`;
  }

  renderSize() {
    const p = this.ws.project;
    this.sizeEl.textContent = p ? `${p.width}×${p.height}` : '';
  }

  renderHint() { this.hintEl.textContent = this.tools.active.constructor.hint || ''; }

  setPointer(pt) {
    const p = this.ws.project;
    if (!pt || !p || pt.x < 0 || pt.y < 0 || pt.x >= p.width || pt.y >= p.height) { this.posEl.textContent = ''; return; }
    this.posEl.textContent = `${Math.floor(pt.x)}, ${Math.floor(pt.y)}`;
  }
}
