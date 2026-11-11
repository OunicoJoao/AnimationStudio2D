/**
 * Painel de cores: seletor, cores recentes e paleta do projeto.
 * @module ui/ColorPanel
 */
import { h, icon, iconButton, clear } from './dom.js';
import { ColorPicker } from './ColorPicker.js';
import { rgbaToCss, rgbaToHex, sameColor, PRESET_PALETTES, presetColors, parsePalette, paletteToGpl } from '../core/color.js';
import { pickFiles, saveBlob } from '../io/files.js';
import { safeName } from '../io/Exporter.js';

export class ColorPanel {
  constructor(root, { colors, ws, toast, menu, settings }) {
    Object.assign(this, { root, colors, ws, toast, menu, settings });
    this.selected = -1;
    this.#build();
    colors.on('change', () => { this.picker.set(colors.fg); this.renderPalette(); });
    colors.on('recent', () => this.renderRecent());
    ws.on('change', ({ kind }) => { if (kind === 'project' || kind === 'palette' || kind === 'all') this.renderPalette(); });
  }

  #build() {
    this.picker = new ColorPicker({ color: this.colors.fg, onChange: (c, live) => { if (!live) this.colors.setFg(c); else { this.colors.fg = c; this.colors.emit('live'); } } });
    this.recentEl = h('div.swatches.recent', { role: 'list', 'aria-label': 'Cores recentes' });
    this.palEl = h('div.swatches', { role: 'listbox', 'aria-label': 'Paleta do projeto' });
    this.toggleBtn = h('button.panel-toggle', { type: 'button', 'aria-expanded': 'true', onclick: () => this.settings.set('colorPicker', !this.settings.get('colorPicker')) },
      h('h3', 'Cor'), h('span.cur-chip'), icon('chevronDown', 18));
    const head = h('div.panel-head', this.toggleBtn,
      h('div.panel-actions', iconButton('more', 'Opções da paleta', (e) => this.#paletteMenu(e.currentTarget))));
    this.pickerWrap = h('div.picker-wrap', this.picker.el);
    this.root.append(head, this.pickerWrap,
      h('div.sub-head', h('span', 'Recentes')), this.recentEl,
      h('div.sub-head', h('span', 'Paleta'), h('div.panel-actions',
        iconButton('plus', 'Adicionar a cor atual à paleta', () => this.#add()),
        iconButton('minus', 'Remover a cor selecionada', () => this.#remove()))),
      this.palEl);
    this.renderRecent();
    this.renderPalette();
    this.#syncCollapse();
    this.settings.on('change', ({ path }) => { if (path === 'colorPicker') this.#syncCollapse(); });
    this.colors.on('change', () => this.#chip());
    this.colors.on('live', () => this.#chip());
  }

  #syncCollapse() {
    const open = this.settings.get('colorPicker') !== false;
    this.pickerWrap.hidden = !open;
    this.toggleBtn.setAttribute('aria-expanded', String(open));
    this.root.classList.toggle('collapsed', !open);
    this.#chip();
  }

  #chip() { this.toggleBtn.querySelector('.cur-chip').style.setProperty('--c', rgbaToCss(this.colors.fg)); }

  #swatch(c, { title, onPick, onAlt, selected = false, current = false }) {
    let timer = null, long = false;
    const b = h(`button.swatch${selected ? '.sel' : ''}${current ? '.cur' : ''}`, {
      type: 'button', title, 'aria-label': title, style: { '--c': rgbaToCss(c) },
      onclick: () => { if (!long) onPick(); long = false; },
      oncontextmenu: (e) => { e.preventDefault(); onAlt?.(); },
      onpointerdown: (e) => { if (e.pointerType === 'mouse') return; long = false; timer = setTimeout(() => { long = true; onAlt?.(); navigator.vibrate?.(10); }, 480); },
      onpointerup: () => clearTimeout(timer), onpointerleave: () => clearTimeout(timer), onpointercancel: () => clearTimeout(timer),
    });
    return b;
  }

  renderRecent() {
    clear(this.recentEl);
    if (!this.colors.recent.length) { this.recentEl.append(h('p.hint', 'As cores que você usar aparecem aqui.')); return; }
    for (const c of this.colors.recent) {
      this.recentEl.append(this.#swatch(c, { title: rgbaToHex(c, true), onPick: () => this.colors.setFg(c), onAlt: () => this.colors.setBg(c) }));
    }
  }

  renderPalette() {
    const p = this.ws.project;
    clear(this.palEl);
    if (!p) return;
    p.palette.forEach((c, i) => {
      this.palEl.append(this.#swatch(c, {
        title: `${rgbaToHex(c)} — toque: cor principal · segure ou clique direito: cor secundária`,
        selected: i === this.selected, current: sameColor(c, this.colors.fg),
        onPick: () => { this.selected = i; this.colors.setFg(c); },
        onAlt: () => { this.selected = i; this.colors.setBg(c); this.renderPalette(); },
      }));
    });
  }

  #touchPalette() {
    const p = this.ws.project;
    p.modified = Date.now();
    this.ws.changed('palette');
  }

  #add() {
    const p = this.ws.project;
    if (!p) return;
    if (p.palette.some((c) => sameColor(c, this.colors.fg))) { this.toast('Esta cor já está na paleta.'); return; }
    p.palette.push([...this.colors.fg]);
    this.selected = p.palette.length - 1;
    this.#touchPalette();
  }

  #remove() {
    const p = this.ws.project;
    if (!p || this.selected < 0 || this.selected >= p.palette.length) { this.toast('Toque numa cor da paleta para selecioná-la.'); return; }
    p.palette.splice(this.selected, 1);
    this.selected = Math.min(this.selected, p.palette.length - 1);
    this.#touchPalette();
  }

  #paletteMenu(btn) {
    const p = this.ws.project;
    const items = [{ header: 'Paletas prontas' }];
    for (const name of Object.keys(PRESET_PALETTES)) items.push({ label: name, run: () => { p.palette = presetColors(name); this.selected = -1; this.#touchPalette(); } });
    items.push('-',
      { label: 'Importar paleta (.gpl, .pal, .hex, .txt)', icon: 'upload', run: () => this.#import() },
      { label: 'Exportar paleta (.gpl)', icon: 'download', run: () => saveBlob(new Blob([paletteToGpl(p.palette, p.name)], { type: 'text/plain' }), `${safeName(p.name)}-paleta.gpl`) });
    this.menu.open(btn, items);
  }

  async #import() {
    const [f] = await pickFiles('.gpl,.pal,.hex,.txt');
    if (!f) return;
    const cols = parsePalette(await f.text());
    if (!cols.length) { this.toast('Nenhuma cor encontrada no arquivo.'); return; }
    this.ws.project.palette = cols;
    this.selected = -1;
    this.#touchPalette();
    this.toast(`${cols.length} cores importadas`);
  }
}
