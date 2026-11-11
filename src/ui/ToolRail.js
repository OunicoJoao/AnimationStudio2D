/**
 * Barra vertical de ferramentas + amostras de cor principal/secundária.
 * @module ui/ToolRail
 */
import { h, icon, clear, kbd } from './dom.js';
import { rgbaToCss } from '../core/color.js';

export class ToolRail {
  constructor(root, { tools, colors, commands }) {
    Object.assign(this, { root, tools, colors, commands });
    this.buttons = new Map();
    this.#build();
    tools.on('change', () => this.render());
    colors.on('change', () => this.renderColors());
    colors.on('live', () => this.renderColors());
  }

  #build() {
    const list = h('div.rail-tools', { role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': 'Ferramentas' });
    for (const C of this.tools.classes) {
      if (!C) { list.append(h('div.rail-sep')); continue; }
      const b = h('button.tool', {
        type: 'button', title: `${C.label} (${kbd(C.key)})${C.hint ? '\n' + C.hint : ''}`, 'aria-label': C.label,
        'aria-pressed': 'false', onclick: () => this.tools.select(C.id),
      }, icon(C.icon, 22));
      this.buttons.set(C.id, b);
      list.append(b);
    }
    this.fgSw = h('button.sw.sw-fg', { type: 'button', title: 'Cor principal (clique para escolher)', 'aria-label': 'Cor principal', onclick: () => this.commands.run('pickColor', 'fg') });
    this.bgSw = h('button.sw.sw-bg', { type: 'button', title: 'Cor secundária (clique para escolher)', 'aria-label': 'Cor secundária', onclick: () => this.commands.run('pickColor', 'bg') });
    const swap = h('button.sw-swap', { type: 'button', title: `Trocar cores (${kbd('X')})`, 'aria-label': 'Trocar cores', onclick: () => this.colors.swap() }, icon('swap', 14));
    clear(this.root).append(list, h('div.rail-colors', this.bgSw, this.fgSw, swap));
    this.render();
    this.renderColors();
  }

  render() {
    const active = this.tools.current.id, temp = this.tools.temp?.id;
    for (const [id, b] of this.buttons) {
      b.classList.toggle('on', id === active);
      b.classList.toggle('temp', id === temp);
      b.setAttribute('aria-pressed', String(id === active));
    }
  }

  renderColors() {
    this.fgSw.style.setProperty('--c', rgbaToCss(this.colors.fg));
    this.bgSw.style.setProperty('--c', rgbaToCss(this.colors.bg));
  }
}
