/**
 * Campos de formulário reutilizados pelos diálogos.
 * @module ui/form
 */
import { h, icon } from './dom.js';

let n = 0;
const nid = () => 'f' + ++n;

export function textField(label, value = '', attrs = {}) {
  const id = nid();
  const input = h('input.field', { id, type: 'text', value, ...attrs });
  return { el: h('div.fld', h('label', { for: id }, label), input), input, get value() { return input.value; } };
}

export function numberField(label, value, { min = 1, max = 99999, step = 1, unit = '' } = {}) {
  const id = nid();
  const input = h('input.field.num-field', { id, type: 'number', value, min, max, step, inputMode: 'numeric' });
  return {
    el: h('div.fld', h('label', { for: id }, label), h('div.with-unit', input, unit ? h('span.unit', unit) : null)),
    input,
    get value() { return Math.max(min, Math.min(max, Number(input.value) || min)); },
  };
}

export function selectField(label, options, value) {
  const id = nid();
  const sel = h('select.field', { id }, Object.entries(options).map(([v, l]) => h('option', { value: v, selected: v === String(value) }, l)));
  return { el: h('div.fld', h('label', { for: id }, label), sel), input: sel, get value() { return sel.value; } };
}

/** Grupo de opções exclusivas como botões (estilo segmentado). */
export function choiceField(label, options, value, onChange) {
  let cur = value;
  const btns = options.map((o) => h('button', {
    type: 'button', 'aria-pressed': String(o.value === cur), class: o.value === cur ? 'on' : '', title: o.title || o.label,
    onclick: () => { cur = o.value; btns.forEach((b, i) => { const on = options[i].value === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); onChange?.(cur); },
  }, o.icon ? icon(o.icon, 18) : null, o.label ? h('span', o.label) : null));
  return { el: h('div.fld', h('span.fld-label', label), h('div.seg.wide', { role: 'group', 'aria-label': label }, btns)), get value() { return cur; } };
}

export function checkField(label, checked, hint = '') {
  const id = nid();
  const input = h('input', { id, type: 'checkbox', checked });
  return { el: h('label.check', { for: id }, input, h('span', label, hint ? h('small', hint) : null)), input, get value() { return input.checked; } };
}

export function rangeField(label, value, { min = 0, max = 100, step = 1, unit = '', onInput } = {}) {
  const id = nid();
  const out = h('output', { for: id }, `${value}${unit}`);
  const input = h('input.range', { id, type: 'range', min, max, step, value });
  const paint = () => { input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`); out.textContent = `${input.value}${unit}`; };
  input.addEventListener('input', () => { paint(); onInput?.(+input.value); });
  paint();
  return { el: h('div.fld.fld-range', h('div.fld-row', h('label', { for: id }, label), out), input), input, get value() { return +input.value; } };
}
