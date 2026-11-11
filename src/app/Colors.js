/**
 * Cor principal/secundária e cores recentes (persistidas nas preferências).
 * @module app/Colors
 */
import { Emitter } from '../core/Emitter.js';
import { hexToRgba, rgbaToHex, sameColor } from '../core/color.js';

export class Colors extends Emitter {
  /** @param {import('./Settings.js').Settings} settings */
  constructor(settings) {
    super();
    this.settings = settings;
    this.fg = hexToRgba(settings.get('fg')) || [29, 29, 31, 255];
    this.bg = hexToRgba(settings.get('bg')) || [255, 255, 255, 255];
    this.recent = (settings.get('recent') || []).map(hexToRgba).filter(Boolean);
  }

  setFg(c) {
    if (sameColor(c, this.fg)) return;
    this.fg = [...c];
    this.settings.set('fg', rgbaToHex(c, true));
    this.emit('change');
  }

  setBg(c) {
    if (sameColor(c, this.bg)) return;
    this.bg = [...c];
    this.settings.set('bg', rgbaToHex(c, true));
    this.emit('change');
  }

  swap() {
    [this.fg, this.bg] = [this.bg, this.fg];
    this.settings.set('fg', rgbaToHex(this.fg, true));
    this.settings.set('bg', rgbaToHex(this.bg, true));
    this.emit('change');
  }

  /** Guarda a cor usada num traço na lista de recentes (máx. 12). */
  remember(c = this.fg) {
    const list = [c, ...this.recent.filter((r) => !sameColor(r, c))].slice(0, 12);
    if (list.length === this.recent.length && list.every((r, i) => sameColor(r, this.recent[i]))) return;
    this.recent = list;
    this.settings.set('recent', list.map((r) => rgbaToHex(r, true)));
    this.emit('recent');
  }
}
