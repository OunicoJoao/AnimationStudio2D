/**
 * Pilha de desfazer/refazer baseada no padrão Command.
 * Cada comando implementa `undo()` e `redo()` e informa quanta memória ocupa (`bytes`),
 * para o histórico descartar os passos mais antigos quando passar do orçamento.
 * @module history/History
 */
import { Emitter } from '../core/Emitter.js';

/**
 * @typedef {object} Command
 * @property {string} label    nome mostrado ao usuário ("Pincel", "Nova camada"…)
 * @property {() => void} undo
 * @property {() => void} redo
 * @property {number} [bytes]  memória aproximada ocupada
 * @property {() => void} [dispose]  libera recursos quando o passo sai do histórico
 */

export class History extends Emitter {
  /** @param {{maxSteps?: number, maxBytes?: number}} [opts] */
  constructor({ maxSteps = 150, maxBytes = 384 * 1024 * 1024 } = {}) {
    super();
    this.maxSteps = maxSteps;
    this.maxBytes = maxBytes;
    /** @type {Command[]} */ this.undoStack = [];
    /** @type {Command[]} */ this.redoStack = [];
    this.bytes = 0;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get nextUndoLabel() { return this.undoStack.at(-1)?.label || ''; }
  get nextRedoLabel() { return this.redoStack.at(-1)?.label || ''; }

  /** Registra um comando que JÁ foi aplicado. */
  push(cmd) {
    for (const c of this.redoStack) this.#drop(c);
    this.redoStack = [];
    this.undoStack.push(cmd);
    this.bytes += cmd.bytes || 0;
    this.#trim();
    this.emit('change', { type: 'push', label: cmd.label });
  }

  /** Aplica um comando e o registra. */
  execute(cmd) {
    cmd.redo();
    this.push(cmd);
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.undo();
    this.redoStack.push(cmd);
    this.emit('change', { type: 'undo', label: cmd.label });
    return cmd;
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.redo();
    this.undoStack.push(cmd);
    this.emit('change', { type: 'redo', label: cmd.label });
    return cmd;
  }

  clear() {
    for (const c of [...this.undoStack, ...this.redoStack]) this.#drop(c);
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
    this.emit('change', { type: 'clear' });
  }

  #drop(cmd) {
    this.bytes -= cmd.bytes || 0;
    cmd.dispose?.();
  }

  #trim() {
    while (this.undoStack.length > 1 && (this.undoStack.length > this.maxSteps || this.bytes > this.maxBytes)) {
      this.#drop(this.undoStack.shift());
    }
  }
}

/** Comando genérico a partir de duas funções. */
export class FnCommand {
  constructor(label, redo, undo, bytes = 256) {
    this.label = label;
    this.redo = redo;
    this.undo = undo;
    this.bytes = bytes;
  }
}

/** Agrupa vários comandos num único passo de desfazer. */
export class MacroCommand {
  /** @param {string} label @param {Command[]} cmds */
  constructor(label, cmds) {
    this.label = label;
    this.cmds = cmds;
    this.bytes = cmds.reduce((s, c) => s + (c.bytes || 0), 0);
  }
  redo() { for (const c of this.cmds) c.redo(); }
  undo() { for (let i = this.cmds.length - 1; i >= 0; i--) this.cmds[i].undo(); }
  dispose() { for (const c of this.cmds) c.dispose?.(); }
}
