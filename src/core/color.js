/**
 * Conversões de cor e paletas. Cores são arrays [r, g, b, a] com valores 0–255.
 * @module core/color
 */
import { clamp } from './math.js';

/** @typedef {[number, number, number, number]} RGBA */

const hx = (v) => Math.round(v).toString(16).padStart(2, '0');

/** "#rgb", "#rrggbb" ou "#rrggbbaa" (com ou sem #) → RGBA. Retorna null se inválido. */
export function hexToRgba(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null;
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 255];
}

export function rgbaToHex(c, withAlpha = false) {
  return '#' + hx(c[0]) + hx(c[1]) + hx(c[2]) + (withAlpha && c[3] < 255 ? hx(c[3]) : '');
}

export const rgbaToCss = (c) => `rgba(${c[0]},${c[1]},${c[2]},${+(c[3] / 255).toFixed(3)})`;

/** RGB 0–255 → HSV (h 0–360, s 0–1, v 0–1). */
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

/** HSV → RGB 0–255 (inteiros). */
export function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** RGB → HSL (h 0–360, s 0–1, l 0–1). */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/** Luminância relativa (WCAG) para escolher tinta clara/escura sobre uma cor. */
export function luminance([r, g, b]) {
  const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export const sameColor = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
export const withAlpha = (c, a) => [c[0], c[1], c[2], clamp(Math.round(a), 0, 255)];

/** Paletas prontas, pensadas para desenho e animação (não pixel art). */
export const PRESET_PALETTES = {
  'Estúdio': '1d1d1f 4a4a4f 8e8e93 c7c7cc ffffff f25c54 f7a072 f6cf6e 9bd18b 6fae86 6ec6f0 4c7bd9 b39ddb 8e5ea2 f4a6c4 a47148 e8c39e',
  'Pele e cabelo': '3b2219 5b3a29 7a4a33 a0663f c68863 e0ac69 f1c27d ffdbac fde4d0 2b1b17 4b2e1f 8d5524 c9a227 e6be8a d4a373 9e5e3c',
  'Pastel': 'fbe7c6 b4f8c8 a0e7e5 ffaebc f6cf6e c9bdf7 f08c8c 8fd3fe d7f9a7 ffd6a5 caffbf 9bf6ff bdb2ff ffc6ff fffffc 2f2f33',
  'Noite': '0b1026 1b2245 2e3a6b 4a5a9c 7b8cd6 b8c4ff f2e9e4 ffcf56 ff9f43 ee5253 5f27cd 341f97 10ac84 1dd1a1 576574 c8d6e5',
  'Tons de cinza': '000000 1c1c1c 333333 4d4d4d 666666 808080 999999 b3b3b3 cccccc e6e6e6 ffffff',
  'Natureza': '264027 3b5e2b 5c8a3a 8fbf4d c9e07a f2efc7 7a5230 a67b5b d9b38c 4a7fa7 7fb7d9 cfe8f3 e2725b f4b860 2d2d2d fafafa',
};

export const presetColors = (name) => (PRESET_PALETTES[name] || '').split(/\s+/).filter(Boolean).map(hexToRgba);

/**
 * Lê paletas em .gpl (GIMP), .pal (JASC), .hex ou texto com cores hex.
 * @returns {RGBA[]}
 */
export function parsePalette(txt) {
  const cols = [];
  const lines = String(txt).split(/\r?\n/);
  if (/^JASC-PAL/.test(lines[0])) {
    for (const l of lines.slice(3)) {
      const m = l.trim().split(/\s+/).map(Number);
      if (m.length >= 3 && m.slice(0, 3).every((v) => v >= 0 && v <= 255)) cols.push([m[0], m[1], m[2], 255]);
    }
    return cols.slice(0, 256);
  }
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.startsWith(';') || /^(GIMP|Name:|Columns:)/.test(t)) continue;
    if (t.startsWith('#') && !/^#[0-9a-f]{6}/i.test(t)) continue;
    const m = t.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (m) { cols.push([+m[1], +m[2], +m[3], 255]); continue; }
    const hm = t.match(/#?([0-9a-f]{6}([0-9a-f]{2})?)\b/i);
    if (hm) cols.push(hexToRgba(hm[1]));
  }
  return cols.slice(0, 256);
}

/** Exporta paleta como arquivo GIMP (.gpl). */
export function paletteToGpl(cols, name = 'AnimationStudio') {
  return `GIMP Palette\nName: ${name}\nColumns: 8\n#\n` +
    cols.map((c) => `${String(c[0]).padStart(3)} ${String(c[1]).padStart(3)} ${String(c[2]).padStart(3)}\t${rgbaToHex(c).slice(1)}`).join('\n') + '\n';
}
