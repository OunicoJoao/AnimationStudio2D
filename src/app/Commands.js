/**
 * Registro central de comandos. Menus, atalhos, botões e a paleta de ajuda leem daqui,
 * então um comando novo aparece em todos os lugares sem mudar a interface (aberto/fechado).
 * @module app/Commands
 */
import { Emitter } from '../core/Emitter.js';

/**
 * @typedef {object} CommandDef
 * @property {string} label
 * @property {() => any} run
 * @property {string} [key]   atalho, ex.: 'Ctrl+Z', 'Shift+N', 'Delete'
 * @property {string} [icon]
 * @property {() => boolean} [enabled]
 * @property {() => boolean} [checked]
 * @property {boolean} [editorOnly=true]  só funciona com um projeto aberto
 */

export class Commands extends Emitter {
  constructor() {
    super();
    /** @type {Map<string, CommandDef>} */
    this.map = new Map();
    this.guard = () => true;
  }

  /** @param {Record<string, CommandDef>} defs */
  register(defs) {
    for (const [id, d] of Object.entries(defs)) this.map.set(id, { editorOnly: true, ...d, id });
  }

  get(id) { return this.map.get(id); }

  isEnabled(id) {
    const c = this.map.get(id);
    if (!c) return false;
    if (c.editorOnly && !this.guard()) return false;
    return c.enabled ? !!c.enabled() : true;
  }

  isChecked(id) { return !!this.map.get(id)?.checked?.(); }

  run(id, ...args) {
    const c = this.map.get(id);
    if (!c || !this.isEnabled(id)) return false;
    const r = c.run(...args);
    this.emit('run', id);
    return r ?? true;
  }

  /** Encontra o comando de um atalho normalizado (ex.: 'Ctrl+Shift+Z'). */
  byKey(combo) {
    for (const c of this.map.values()) {
      if (!c.key) continue;
      for (const k of c.key.split(' / ')) if (k === combo) return c.id;
    }
    return null;
  }
}
