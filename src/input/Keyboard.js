/**
 * Atalhos de teclado: comandos do registro, letras das ferramentas e trocas
 * temporárias (Espaço = mão, Alt = conta-gotas).
 * @module input/Keyboard
 */

const isTyping = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !['range', 'checkbox', 'button', 'radio'].includes(t.type)) || t?.isContentEditable;
const ALT_PICK = new Set(['brush', 'eraser', 'fill', 'gradient']);

/** Normaliza um evento para o formato dos atalhos ('Ctrl+Shift+Z', 'B', 'Delete'). */
export function comboOf(e) {
  let k = e.key;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) k = e.code.slice(5);
  else if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  if (k === '=' ) k = '+';
  if (k === '_') k = '-';
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && !(k === '+' && !/^Key/.test(e.code))) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

export class Keyboard {
  /**
   * @param {object} deps
   * @param {() => boolean} deps.isEditor  o editor está na tela
   */
  constructor({ commands, tools, isEditor, input }) {
    Object.assign(this, { commands, tools, isEditor, input });
    window.addEventListener('keydown', (e) => this.#down(e));
    window.addEventListener('keyup', (e) => this.#up(e));
    window.addEventListener('blur', () => { this.tools.popTemp(); });
  }

  #down(e) {
    if (!this.isEditor() || isTyping(e.target) || document.querySelector('.dlg-wrap:not(.closing)')) return;
    if (e.key === ' ' && !e.repeat) {
      e.preventDefault();
      if (this.input.primary === null) this.tools.pushTemp('hand');
      return;
    }
    if (e.key === 'Alt') {
      e.preventDefault();
      if (!e.repeat && ALT_PICK.has(this.tools.current.id) && this.input.primary === null) this.tools.pushTemp('eyedropper');
      return;
    }
    if (this.tools.active.key(e)) { e.preventDefault(); return; }
    const combo = comboOf(e);
    // Ctrl+V deixa o navegador disparar "paste" (traz imagens de outros apps sem pedir permissão)
    if (combo === 'Ctrl+V' || combo === 'Ctrl+Shift+V') return;
    const id = this.commands.byKey(combo);
    if (id) {
      e.preventDefault();
      if (!e.repeat || /^(undo|redo|framePrev|frameNext|zoomIn|zoomOut)$/.test(id)) this.commands.run(id);
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      const C = this.tools.classes.find((c) => c && c.key === combo);
      if (C) { e.preventDefault(); this.tools.select(C.id); }
    }
  }

  #up(e) {
    if (e.key === ' ') this.tools.popTemp('hand');
    if (e.key === 'Alt') { e.preventDefault(); this.tools.popTemp('eyedropper'); }
  }
}
