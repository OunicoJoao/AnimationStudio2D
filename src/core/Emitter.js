/**
 * Emissor de eventos mínimo. Base para objetos observáveis (estado, histórico, reprodução).
 * @module core/Emitter
 */
export class Emitter {
  #handlers = new Map();

  /** Registra um ouvinte e devolve a função que o remove. */
  on(type, fn) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.#handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.#handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
