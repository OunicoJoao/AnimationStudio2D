/**
 * Barra de opções da ferramenta ativa, gerada a partir de `tool.options()`.
 * @module ui/ToolOptions
 */
import { h, icon, clear } from './dom.js';

let uidN = 0;

/** Controle deslizante com campo numérico; com `log`, a escala é logarítmica. */
export function slider({ label, min, max, step = 1, unit = '', log = false, get, set, compact = false }) {
  const id = 'sl' + ++uidN;
  const toPos = (v) => (log ? Math.round((Math.log(v / min) / Math.log(max / min)) * 1000) : v);
  const fromPos = (p) => (log ? Math.round(min * Math.pow(max / min, p / 1000)) : +p);
  const range = h('input.range', { id, type: 'range', min: log ? 0 : min, max: log ? 1000 : max, step: log ? 1 : step, 'aria-label': label });
  const num = h('input.num', { type: 'number', min, max, step, 'aria-label': `${label} (valor)` });
  const sync = () => { const v = get(); range.value = toPos(v); num.value = v; range.style.setProperty('--p', `${((range.value - range.min) / (range.max - range.min)) * 100}%`); };
  range.addEventListener('input', () => { set(fromPos(range.value), true); sync(); });
  range.addEventListener('change', () => set(fromPos(range.value), false));
  num.addEventListener('change', () => { const v = Math.max(min, Math.min(max, +num.value || min)); set(v, false); sync(); });
  sync();
  const el = h(`div.opt.opt-slider${compact ? '.compact' : ''}`, h('label', { for: id }, label), range, h('span.num-wrap', num, unit ? h('span.unit', unit) : null));
  return { el, sync };
}

export class ToolOptions {
  constructor(root, { tools, settings, commands }) {
    Object.assign(this, { root, tools, settings, commands });
    this.syncers = [];
    tools.on('change', () => this.render());
    settings.on('change', () => this.sync());
    this.render();
  }

  sync() { for (const s of this.syncers) s(); }

  render() {
    const t = this.tools.active;
    const s = this.settings;
    this.syncers = [];
    clear(this.root);
    this.root.append(h('div.opt-title', icon(t.constructor.icon, 18), h('span', t.label)));
    for (const o of t.options()) {
      let el;
      if (o.type === 'slider') {
        const sl = slider({ ...o, get: () => s.get(o.key), set: (v) => s.set(o.key, v) });
        this.syncers.push(sl.sync);
        el = sl.el;
      } else if (o.type === 'segmented') {
        const btns = o.options.map((op) => h('button', {
          type: 'button', title: op.label, 'aria-label': op.label, 'aria-pressed': 'false',
          onclick: () => s.set(o.key, op.value),
        }, op.icon ? icon(op.icon, 18) : op.label));
        const sync = () => btns.forEach((b, i) => { const on = s.get(o.key) === o.options[i].value; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        sync();
        this.syncers.push(sync);
        const iconsOnly = o.options.every((x) => x.icon);
        el = h('div.opt', iconsOnly ? null : h('span.opt-label', o.label), h(`div.seg${iconsOnly ? '.icons' : ''}`, { role: 'group', 'aria-label': o.label }, btns));
      } else if (o.type === 'toggle') {
        const b = h('button.chip', { type: 'button', 'aria-pressed': 'false', title: o.label, onclick: () => s.set(o.key, !s.get(o.key)) }, o.icon ? icon(o.icon, 18) : null, h('span', o.label));
        const sync = () => { const on = !!s.get(o.key); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
        sync();
        this.syncers.push(sync);
        el = h('div.opt', b);
      } else if (o.type === 'select') {
        const sel = h('select.field.sm', { 'aria-label': o.label, onchange: () => s.set(o.key, sel.value) }, o.options.map((op) => h('option', { value: op.value }, op.label)));
        const sync = () => { sel.value = s.get(o.key); };
        sync();
        this.syncers.push(sync);
        el = h('div.opt', o.icon ? h('span.opt-ic', { title: o.label }, icon(o.icon, 18)) : h('span.opt-label', o.label), sel);
      } else if (o.type === 'button') {
        const b = h(`button.btn.sm${o.primary ? '.pri' : ''}`, { type: 'button', title: o.label, onclick: () => { o.action(); this.sync(); } }, o.icon ? icon(o.icon, 18) : null, h('span', o.label));
        const sync = () => { b.disabled = !!o.disabled?.(); };
        sync();
        this.syncers.push(sync);
        el = h('div.opt', b);
      }
      if (el) this.root.append(el);
    }
  }
}
