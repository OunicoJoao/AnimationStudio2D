/**
 * Filtros de imagem sobre buffers RGBA (puros). Cada filtro recebe `src` (somente leitura)
 * e escreve em `dst` do mesmo tamanho; `mask` opcional (0–255) limita e suaviza o efeito.
 * @module raster/filters
 */
import { clamp } from '../core/math.js';
import { rgbToHsl, hslToRgb } from '../core/color.js';

/** Mistura o resultado filtrado com o original de acordo com a máscara. */
function applyMask(src, dst, mask) {
  if (!mask) return dst;
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const m = mask[p];
    if (m === 255) continue;
    const t = m / 255;
    for (let k = 0; k < 4; k++) dst[i + k] = src[i + k] + (dst[i + k] - src[i + k]) * t;
  }
  return dst;
}

/** Aplica uma função por pixel visível. */
function perPixel(src, dst, mask, fn) {
  for (let i = 0; i < src.length; i += 4) {
    if (!src[i + 3]) { dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = 0; continue; }
    fn(src, dst, i);
  }
  return applyMask(src, dst, mask);
}

export const invert = (src, dst, mask) => perPixel(src, dst, mask, (s, d, i) => {
  d[i] = 255 - s[i]; d[i + 1] = 255 - s[i + 1]; d[i + 2] = 255 - s[i + 2]; d[i + 3] = s[i + 3];
});

export const grayscale = (src, dst, mask) => perPixel(src, dst, mask, (s, d, i) => {
  const g = Math.round(0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2]);
  d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = s[i + 3];
});

/** brightness e contrast de -100 a 100. */
export function brightnessContrast(src, dst, mask, { brightness = 0, contrast = 0 }) {
  const b = brightness * 2.55;
  const c = contrast * 2.55;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  return perPixel(src, dst, mask, (s, d, i) => {
    for (let k = 0; k < 3; k++) d[i + k] = clamp(f * (s[i + k] + b - 128) + 128, 0, 255);
    d[i + 3] = s[i + 3];
  });
}

/** hue em graus (-180..180), saturation e lightness de -100 a 100. */
export function hueSaturation(src, dst, mask, { hue = 0, saturation = 0, lightness = 0 }) {
  const ss = saturation / 100, ll = lightness / 100;
  return perPixel(src, dst, mask, (s, d, i) => {
    let [h, sat, l] = rgbToHsl(s[i], s[i + 1], s[i + 2]);
    h += hue;
    sat = clamp(ss >= 0 ? sat + (1 - sat) * ss * sat : sat * (1 + ss), 0, 1);
    l = clamp(ll >= 0 ? l + (1 - l) * ll : l * (1 + ll), 0, 1);
    const [r, g, b] = hslToRgb(h, sat, l);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = s[i + 3];
  });
}

/**
 * Desfoque gaussiano aproximado por três passadas de caixa, com alfa pré-multiplicado
 * (evita halos escuros nas bordas transparentes).
 */
export function blur(src, dst, mask, { radius = 4, width, height }) {
  const n = width * height;
  const r = Math.max(1, Math.round(radius / 1.7));
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = src[i + 3] / 255;
    ch[0][p] = src[i] * a; ch[1][p] = src[i + 1] * a; ch[2][p] = src[i + 2] * a; ch[3][p] = src[i + 3];
  }
  const tmp = new Float32Array(n);
  for (const c of ch) for (let pass = 0; pass < 3; pass++) { boxH(c, tmp, width, height, r); boxV(tmp, c, width, height, r); }
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = ch[3][p];
    const ia = a > 0 ? 255 / a : 0;
    dst[i] = clamp(ch[0][p] * ia, 0, 255); dst[i + 1] = clamp(ch[1][p] * ia, 0, 255); dst[i + 2] = clamp(ch[2][p] * ia, 0, 255); dst[i + 3] = clamp(a, 0, 255);
  }
  return applyMask(src, dst, mask);
}

function boxH(s, d, w, h, r) {
  const inv = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = s[row] * (r + 1);
    for (let x = 0; x < r; x++) acc += s[row + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      acc += s[row + Math.min(x + r, w - 1)] - s[row + Math.max(x - r - 1, 0)];
      d[row + x] = acc * inv;
    }
  }
}
function boxV(s, d, w, h, r) {
  const inv = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    let acc = s[x] * (r + 1);
    for (let y = 0; y < r; y++) acc += s[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      acc += s[Math.min(y + r, h - 1) * w + x] - s[Math.max(y - r - 1, 0) * w + x];
      d[y * w + x] = acc * inv;
    }
  }
}

/** Contorno: desenha uma borda de `size` px na cor dada em volta do conteúdo. */
export function outline(src, dst, mask, { size = 3, color = [0, 0, 0, 255], width, height }) {
  const n = width * height;
  const alpha = new Float32Array(n);
  for (let p = 0; p < n; p++) alpha[p] = src[p * 4 + 3];
  // dilatação por máximo em janela quadrada separável, depois suavizada
  const tmp = new Float32Array(n), grown = new Float32Array(n);
  const r = Math.max(1, Math.round(size));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let m = 0;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < width) { const v = alpha[y * width + xx]; if (v > m) m = v; } }
    tmp[y * width + x] = m;
  }
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
    let m = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < height) { const v = tmp[yy * width + x]; if (v > m) m = v; } }
    grown[y * width + x] = m;
  }
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const sa = src[i + 3] / 255, oa = (grown[p] / 255) * (color[3] / 255);
    const outA = sa + oa * (1 - sa);
    if (outA <= 0) { dst[i] = dst[i + 1] = dst[i + 2] = dst[i + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) dst[i + k] = (src[i + k] * sa + color[k] * oa * (1 - sa)) / outA;
    dst[i + 3] = outA * 255;
  }
  return applyMask(src, dst, mask);
}

/** Troca uma cor por outra (com tolerância) preservando o alfa. */
export function replaceColor(src, dst, mask, { from, to, tolerance = 32 }) {
  return perPixel(src, dst, mask, (s, d, i) => {
    const hit = Math.abs(s[i] - from[0]) <= tolerance && Math.abs(s[i + 1] - from[1]) <= tolerance && Math.abs(s[i + 2] - from[2]) <= tolerance;
    if (hit) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; } else { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; }
    d[i + 3] = s[i + 3];
  });
}

export const FILTERS = {
  invert: { label: 'Inverter cores', fn: invert },
  grayscale: { label: 'Escala de cinza', fn: grayscale },
  brightnessContrast: { label: 'Brilho e contraste', fn: brightnessContrast },
  hueSaturation: { label: 'Matiz e saturação', fn: hueSaturation },
  blur: { label: 'Desfocar', fn: blur },
  outline: { label: 'Contorno', fn: outline },
  replaceColor: { label: 'Substituir cor', fn: replaceColor },
};
