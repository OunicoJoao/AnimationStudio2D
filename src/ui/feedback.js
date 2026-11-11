/**
 * Tema (claro/escuro/sistema), avisos rápidos (toast) e janelas de diálogo.
 * @module ui/feedback
 */
import { h, icon, clear } from './dom.js';

/* ---------------- Tema ---------------- */

export class Theme {
  /** @param {import('../app/Settings.js').Settings} settings */
  constructor(settings) {
    this.settings = settings;
    this.media = window.matchMedia('(prefers-color-scheme: dark)');
    this.listeners = new Set();
    this.media.addEventListener?.('change', () => this.apply());
    settings.on('change', ({ path }) => { if (path === 'theme') this.apply(); });
    this.apply();
  }

  get mode() { return this.settings.get('theme'); }
  get isDark() { return this.mode === 'dark' || (this.mode === 'system' && this.media.matches); }

  apply() {
    const dark = this.isDark;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#18191d' : '#f3f3f1';
    for (const fn of this.listeners) fn(dark);
  }

  onChange(fn) { this.listeners.add(fn); }

  /** Alterna claro → escuro → sistema. */
  cycle() {
    const order = ['light', 'dark', 'system'];
    this.settings.set('theme', order[(order.indexOf(this.mode) + 1) % order.length]);
  }
}

/* ---------------- Toast ---------------- */

export class Toaster {
  constructor(root) {
    this.root = root;
    this.timer = null;
  }

  /** Mostra uma mensagem curta. Com `action`, inclui um botão (ex.: Desfazer). */
  show(msg, { action = null, ms = 2600 } = {}) {
    clearTimeout(this.timer);
    clear(this.root);
    const el = h('div.toast', { role: 'status' }, h('span', msg));
    if (action) el.append(h('button.toast-act', { type: 'button', onclick: () => { action.run(); this.hide(); } }, action.label));
    this.root.append(el);
    requestAnimationFrame(() => el.classList.add('in'));
    this.timer = setTimeout(() => this.hide(), action ? ms + 2400 : ms);
  }

  hide() {
    const el = this.root.firstChild;
    if (!el) return;
    el.classList.remove('in');
    setTimeout(() => el.remove(), 200);
  }
}

/* ---------------- Diálogos ---------------- */

/**
 * Janela modal. Devolve uma Promise com o valor passado a `close`.
 * @param {object} o
 * @param {string} o.title
 * @param {Node|Node[]} o.body
 * @param {Array<{label:string, value?:any, primary?:boolean, danger?:boolean, onClick?:(close:Function)=>void}>} [o.buttons]
 * @param {string} [o.size]  'sm' | 'md' | 'lg'
 * @param {(close: Function) => void} [o.onOpen]
 */
export function openDialog({ title, body, buttons = [{ label: 'Fechar', value: null }], size = 'md', onOpen, dismissValue = null }) {
  const root = document.getElementById('dialogs');
  const previous = document.activeElement;
  return new Promise((resolve) => {
    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      wrap.classList.remove('in');
      wrap.classList.add('closing');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => wrap.remove(), 160);
      previous?.focus?.();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(dismissValue); }
      if (e.key === 'Tab') trapFocus(e, card);
      if (e.key === 'Enter' && !e.isComposing && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const pri = buttons.find((b) => b.primary);
        if (pri) { e.preventDefault(); e.stopPropagation(); pri.onClick ? pri.onClick(close) : close(pri.value); }
      }
    };
    const titleId = 'dlg-' + Math.random().toString(36).slice(2, 8);
    const footer = h('div.dlg-foot', buttons.map((b) => h(`button.btn${b.primary ? '.pri' : ''}${b.danger ? '.danger' : ''}`, {
      type: 'button',
      onclick: () => (b.onClick ? b.onClick(close) : close(b.value)),
    }, b.label)));
    const card = h(`div.dlg.dlg-${size}`, { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div.dlg-head',
        h('h2', { id: titleId }, title),
        h('button.ib.dlg-x', { type: 'button', 'aria-label': 'Fechar', title: 'Fechar', onclick: () => close(dismissValue) }, icon('close'))),
      h('div.dlg-body', body),
      buttons.length ? footer : null);
    const wrap = h('div.dlg-wrap', { onpointerdown: (e) => { if (e.target === wrap) close(dismissValue); } }, card);
    root.append(wrap);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      wrap.classList.add('in');
      const first = card.querySelector('[autofocus]') || card.querySelector('.dlg-body input, .dlg-body select, .dlg-body textarea, .dlg-body button') || footer.querySelector('.pri') || card.querySelector('button');
      first?.focus?.();
    });
    onOpen?.(close);
  });
}

function trapFocus(e, card) {
  const els = [...card.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
  if (!els.length) return;
  const first = els[0], last = els.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** Confirmação simples. */
export function confirmDialog(title, message, { ok = 'Confirmar', danger = false } = {}) {
  return openDialog({
    title, size: 'sm', dismissValue: false,
    body: h('p.dlg-text', message),
    buttons: [{ label: 'Cancelar', value: false }, { label: ok, value: true, primary: !danger, danger }],
  });
}

/** Pergunta um texto. */
export async function promptDialog(title, label, value = '', { ok = 'Salvar', maxLength = 80 } = {}) {
  const input = h('input.field', { type: 'text', value, maxLength, autofocus: true, 'aria-label': label });
  const res = await openDialog({
    title, size: 'sm',
    body: h('label.fld', h('span', label), input),
    buttons: [{ label: 'Cancelar', value: null }, { label: ok, primary: true, onClick: (close) => close(input.value.trim()) }],
    onOpen: () => setTimeout(() => input.select(), 30),
  });
  return res || null;
}

/** Janela de progresso não modal com botão de cancelar. */
export function progressDialog(title) {
  const bar = h('div.progress-fill');
  const label = h('p.dlg-text', 'Preparando…');
  const ctrl = new AbortController();
  let closeFn = () => {};
  openDialog({
    title, size: 'sm', body: [label, h('div.progress', bar)],
    buttons: [{ label: 'Cancelar', onClick: (close) => { ctrl.abort(); close(); } }],
    onOpen: (close) => { closeFn = close; },
  });
  return {
    signal: ctrl.signal,
    set(t, text) { bar.style.width = `${Math.round(Math.max(0, Math.min(1, t)) * 100)}%`; if (text) label.textContent = text; },
    close() { closeFn(); },
  };
}
