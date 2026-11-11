/**
 * Painel de camadas: lista (de cima para baixo), visibilidade, bloqueio, arrastar para
 * reordenar e propriedades da camada ativa (opacidade, mesclagem, trava de transparência).
 * @module ui/LayersPanel
 */
import { h, icon, iconButton, clear, drag } from './dom.js';
import { slider } from './ToolOptions.js';
import { BLEND_MODES } from '../model/Project.js';
import { debounce } from '../core/debounce.js';

export class LayersPanel {
  constructor(root, { ws, layers, thumbs, commands, menu }) {
    Object.assign(this, { root, ws, layers, thumbs, commands, menu });
    this.listEl = h('div.layer-list', { role: 'listbox', 'aria-label': 'Camadas' });
    this.propsEl = h('div.layer-props');
    root.append(
      h('div.panel-head', h('h3', 'Camadas'), h('div.panel-actions',
        iconButton('plus', 'Nova camada (Shift+N)', () => commands.run('layerNew')),
        iconButton('duplicate', 'Duplicar camada', () => commands.run('layerDuplicate')),
        iconButton('merge', 'Mesclar para baixo', () => commands.run('layerMerge')),
        iconButton('trash', 'Excluir camada', () => commands.run('layerDelete')))),
      this.listEl, this.propsEl);
    this.refreshThumbs = debounce(() => this.#thumbs(), 120);
    ws.on('change', ({ kind }) => {
      if (kind === 'pixels') return this.refreshThumbs();
      if (kind === 'playhead' || kind === 'selection' || kind === 'floating' || kind === 'palette') return;
      this.render();
    });
    this.render();
  }

  render() {
    const p = this.ws.project;
    clear(this.listEl);
    if (!p) return;
    this.rows = [];
    for (let i = p.layers.length - 1; i >= 0; i--) {
      const l = p.layers[i];
      const active = l.id === this.ws.layerId;
      const thumb = h('span.layer-thumb');
      const row = h(`div.layer${active ? '.on' : ''}${l.visible ? '' : '.hidden-layer'}`, {
        role: 'option', 'aria-selected': String(active), tabindex: active ? 0 : -1, dataset: { id: l.id, index: i },
        ondblclick: () => this.commands.run('layerRename', l.id),
        oncontextmenu: (e) => { e.preventDefault(); this.ws.setLayer(l.id); this.#context({ x: e.clientX, y: e.clientY }); },
        onkeydown: (e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); const n = p.layers[i + 1]; if (n) { this.ws.setLayer(n.id); this.#focusActive(); } }
          if (e.key === 'ArrowDown') { e.preventDefault(); const n = p.layers[i - 1]; if (n) { this.ws.setLayer(n.id); this.#focusActive(); } }
        },
      },
      thumb,
      h('span.layer-name', l.name, l.alphaLock ? h('span.badge', { title: 'Transparência travada' }, icon('alphaLock', 14)) : null,
        l.blend !== 'source-over' ? h('span.badge', BLEND_MODES[l.blend]) : null),
      h('span.layer-op', l.opacity < 1 ? `${Math.round(l.opacity * 100)}%` : ''),
      h(`button.ib.sm${l.locked ? '.on' : ''}`, { type: 'button', title: l.locked ? 'Desbloquear' : 'Bloquear', 'aria-label': l.locked ? 'Desbloquear camada' : 'Bloquear camada', 'aria-pressed': String(l.locked), onclick: (e) => { e.stopPropagation(); this.layers.setProp(l.id, 'locked', !l.locked); } }, icon(l.locked ? 'lock' : 'unlock', 18)),
      h('button.ib.sm', { type: 'button', title: l.visible ? 'Ocultar' : 'Mostrar', 'aria-label': l.visible ? 'Ocultar camada' : 'Mostrar camada', 'aria-pressed': String(!l.visible), onclick: (e) => { e.stopPropagation(); this.layers.setProp(l.id, 'visible', !l.visible); } }, icon(l.visible ? 'eye' : 'eyeOff', 18)));
      this.#makeDraggable(row, i);
      this.rows.push({ row, thumb, layer: l });
      this.listEl.append(row);
    }
    this.#thumbs();
    this.#props();
  }

  #focusActive() { this.listEl.querySelector('.layer.on')?.focus(); }

  #thumbs() {
    const p = this.ws.project;
    if (!p || !this.rows) return;
    for (const { thumb, layer } of this.rows) {
      const c = this.thumbs.cel(p, layer.id, this.ws.frameId, 36);
      if (thumb.firstChild !== c) { clear(thumb).append(c); }
      else { /* o mesmo canvas foi redesenhado no lugar */ }
    }
  }

  #makeDraggable(row, index) {
    let ghostY = 0, rowH = 0, target = index;
    drag(row, {
      threshold: 6,
      start: (e) => {
        if (e.target.closest('button')) return false;
        this.ws.setLayer(row.dataset.id);
        rowH = row.getBoundingClientRect().height + 6;
        target = index;
      },
      move: (e, dx, dy) => {
        ghostY = dy;
        row.classList.add('dragging');
        row.style.transform = `translateY(${ghostY}px)`;
        // lista invertida: arrastar para baixo diminui o índice
        target = Math.max(0, Math.min(this.ws.project.layers.length - 1, index - Math.round(dy / rowH)));
      },
      end: (e, moved) => {
        row.classList.remove('dragging');
        row.style.transform = '';
        if (moved && target !== index) this.layers.moveTo(index, target);
      },
    });
    row.addEventListener('click', (e) => { if (!e.target.closest('button')) this.ws.setLayer(row.dataset.id); });
  }

  #context(pt) {
    this.menu.open(pt, ['layerNew', 'layerDuplicate', 'layerRename', 'layerDelete', '-', 'layerUp', 'layerDown', 'layerMerge', '-', 'layerAlphaLock', 'layerProps', 'clear'].map((id) => (id === '-' ? '-' : { cmd: id })));
  }

  #props() {
    const l = this.ws.layer;
    clear(this.propsEl);
    if (!l) return;
    let before = l.opacity;
    const op = slider({
      label: 'Opacidade', min: 0, max: 100, unit: '%', compact: true,
      get: () => Math.round(l.opacity * 100),
      set: (v, live) => {
        if (live) this.layers.preview(l.id, 'opacity', v / 100);
        else { this.layers.setProp(l.id, 'opacity', v / 100, before); before = v / 100; }
      },
    });
    const blend = h('select.field.sm', { 'aria-label': 'Modo de mesclagem', onchange: () => this.layers.setProp(l.id, 'blend', blend.value) },
      Object.entries(BLEND_MODES).map(([v, label]) => h('option', { value: v, selected: v === l.blend }, label)));
    const alpha = h(`button.chip${l.alphaLock ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(l.alphaLock), title: 'Pintar só onde já existe desenho nesta camada', onclick: () => this.layers.setProp(l.id, 'alphaLock', !l.alphaLock) }, icon('alphaLock', 16), h('span', 'Travar transparência'));
    this.propsEl.append(op.el, h('div.opt', h('span.opt-label', 'Mesclagem'), blend), alpha);
  }
}
