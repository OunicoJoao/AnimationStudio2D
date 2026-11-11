/** Identificadores únicos curtos. @module core/ids */
let counter = 0;
export function uid(prefix = '') {
  const rnd = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  counter = (counter + 1) % 1296;
  return prefix + rnd + counter.toString(36).padStart(2, '0');
}
