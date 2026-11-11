/**
 * Preferências do usuário, guardadas no aparelho (localStorage).
 * Acesso por caminho: settings.get('brush.size'), settings.set('brush.size', 12).
 * @module app/Settings
 */
import { Emitter } from '../core/Emitter.js';

export const DEFAULT_SETTINGS = {
  theme: 'system',
  penOnly: false,
  penOnlyChosen: false,
  leftHanded: false,
  fg: '#1d1d1f',
  bg: '#ffffff',
  recent: [],
  tool: 'brush',
  brush: { preset: 'pen', size: 8, opacity: 100, stabilize: 35, pressure: true },
  eraser: { preset: 'hard', size: 28, opacity: 100, stabilize: 10, pressure: true },
  fill: { tolerance: 30, sample: 'all', expand: 2, contiguous: true },
  lassoFill: { mode: 'fill', opacity: 100 },
  shape: { kind: 'rect', mode: 'stroke', size: 6, opacity: 100 },
  gradient: { kind: 'linear', end: 'transparent' },
  select: { kind: 'rect' },
  wand: { tolerance: 24, contiguous: true, sample: 'layer' },
  text: { font: 'Figtree', size: 64, bold: false, italic: false, align: 'left' },
  onion: { on: true, before: 1, after: 1, opacity: 0.35, tint: true, beforeColor: '#e5484d', afterColor: '#2f9e6b' },
  grid: { on: false, size: 64 },
  symmetry: { mode: 'none', count: 6 },
  preview: false,
  colorPicker: true,
  sidePanel: true,
  timeline: true,
};

const KEY = 'animationstudio2d.settings.v1';

function merge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra === undefined ? base : extra;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(extra)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], extra[k]) : extra[k];
  }
  return out;
}

export class Settings extends Emitter {
  /** @param {Storage|null} storage */
  constructor(storage = globalThis.localStorage ?? null) {
    super();
    this.storage = storage;
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(KEY) || 'null'); } catch { saved = null; }
    this.data = merge(structuredClone(DEFAULT_SETTINGS), saved || {});
  }

  get(path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.data);
  }

  set(path, value) {
    const keys = path.split('.');
    let o = this.data;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    const last = keys.at(-1);
    if (o[last] === value) return;
    o[last] = value;
    this.#save();
    this.emit('change', { path, value });
  }

  /** Atualiza vários campos de um grupo de uma vez. */
  patch(group, values) {
    for (const [k, v] of Object.entries(values)) this.set(`${group}.${k}`, v);
  }

  #saveTimer = null;
  #save() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      try { this.storage?.setItem(KEY, JSON.stringify(this.data)); } catch { /* armazenamento cheio ou bloqueado */ }
    }, 200);
  }
}
