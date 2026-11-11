/**
 * Menu suspenso acessível (teclado: setas, Enter, Esc), usado na barra de menus
 * e nos menus de contexto de quadros e camadas.
 * @module ui/Menu
 */
import { h, icon, kbd, clear } from './dom.js';

/**
 * @typedef {'-' | {cmd: string} | {label: string, run: () => void, icon?: string, key?: string, checked?: boolean, disabled?: boolean, danger?: boolean}} MenuItem
 */

export class Menu {
  /** @param {import('../app/Commands.js').Commands} commands */
  constructor(commands) {
    this.commands = commands;
    this.el = h('div.menu', { role: 'menu', hidden: true });
    document.body.append(this.el);
    this.anchor = null;
    this.onClose = null;
    document.addEventListener('pointerdown', (e) => {
      if (!this.el.hidden && !this.el.contains(e.target) && !this.anchor?.contains(e.target)) this.close();
    }, true);
    this.el.addEventListener('keydown', (e) => this.#key(e));
    window.addEventListener('resize', () => this.close());
  }

  get isOpen() { return !this.el.hidden; }

  /**
   * @param {HTMLElement|{x:number,y:number}} anchor  elemento ou ponto (menu de contexto)
   * @param {MenuItem[]} items
   */
  open(anchor, items, { onClose = null, focus = false } = {}) {
    this.close();
    this.anchor = anchor instanceof HTMLElement ? anchor : null;
    this.onClose = onClose;
    clear(this.el);
    for (const it of items) {
      if (it === '-') { this.el.append(h('div.menu-sep', { role: 'separator' })); continue; }
      if (it.header) { this.el.append(h('div.menu-head', it.header)); continue; }
      const def = it.cmd ? this.commands.get(it.cmd) : it;
      if (!def) continue;
      const enabled = it.cmd ? this.commands.isEnabled(it.cmd) : !it.disabled;
      const checked = it.cmd ? (def.checked ? this.commands.isChecked(it.cmd) : null) : it.checked ?? null;
      const btn = h(`button.menu-item${it.danger ? '.danger' : ''}`, {
        type: 'button', role: checked === null ? 'menuitem' : 'menuitemcheckbox',
        'aria-checked': checked === null ? null : String(checked), disabled: !enabled,
        onclick: () => { this.close(); it.cmd ? this.commands.run(it.cmd) : it.run(); },
      },
      h('span.menu-ic', checked === null ? (def.icon ? icon(def.icon, 18) : '') : checked ? icon('check', 18) : ''),
      h('span.menu-label', it.label || def.label),
      def.key ? h('kbd', kbd(def.key.split(' / ')[0])) : null);
      this.el.append(btn);
    }
    this.el.hidden = false;
    const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y, top: anchor.y, right: anchor.x };
    const mw = this.el.offsetWidth, mh = this.el.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + mw > window.innerWidth - 8) x = Math.max(8, window.innerWidth - mw - 8);
    if (y + mh > window.innerHeight - 8) y = Math.max(8, (r.top ?? y) - mh - 6);
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.anchor?.setAttribute('aria-expanded', 'true');
    if (focus) this.el.querySelector('.menu-item:not([disabled])')?.focus();
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.anchor?.setAttribute('aria-expanded', 'false');
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  #key(e) {
    const items = [...this.el.querySelectorAll('.menu-item:not([disabled])')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const a = this.anchor; this.close(); a?.focus(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { this.emitNav?.(e.key === 'ArrowRight' ? 1 : -1); }
  }
}
