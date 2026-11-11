/**
 * Pequenos utilitários de DOM (sem framework).
 * @module ui/dom
 */
import { ICONS } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Cria um elemento: h('button.btn.pri', { onclick, title }, 'Texto', icon('plus'))
 * Atributos começando com "on" viram ouvintes; `class`, `style` (objeto), `dataset` e
 * propriedades booleanas são tratados.
 */
export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = {}; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** Ícone SVG em linha (herda a cor do texto). */
export function icon(name, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ic');
  svg.innerHTML = ICONS[name] || ICONS.dot;
  return svg;
}

/** Botão só com ícone, com rótulo acessível e dica. */
export function iconButton(name, label, onclick, cls = '') {
  return h(`button.ib${cls ? '.' + cls.split(' ').join('.') : ''}`, { type: 'button', title: label, 'aria-label': label, onclick }, icon(name));
}

/** Formata atalhos para a plataforma (⌘ no Mac). */
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const kbd = (k) => (k ? (isMac ? k.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : k) : '');

/** Aceita arrastar a partir de um elemento com ponteiro (mouse, toque e caneta). */
export function drag(el, { start, move, end, threshold = 0 }) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const s = start?.(e);
    if (s === false) return;
    const x0 = e.clientX, y0 = e.clientY;
    let moved = threshold === 0;
    try { el.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < threshold) return;
      moved = true;
      move?.(ev, ev.clientX - x0, ev.clientY - y0);
    };
    const up = (ev) => {
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      end?.(ev, moved);
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}
