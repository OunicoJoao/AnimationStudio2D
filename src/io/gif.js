/**
 * Codificador de GIF animado próprio: paleta global por corte mediano (amostrada),
 * tabela de busca de 15 bits e pontilhado Floyd–Steinberg opcional para degradês suaves.
 * Puro, roda no Node para testes.
 * @module io/gif
 */

/** Corte mediano sobre amostras [r, g, b, peso]. */
export function medianCut(px, n) {
  let boxes = [px];
  while (boxes.length < n) {
    let bi = -1, br = -1, bc = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let mn = 255, mx = 0;
        for (const p of b) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
        if (mx - mn > br) { br = mx - mn; bi = i; bc = c; }
      }
    });
    if (bi < 0 || br <= 0) break;
    const b = boxes[bi].sort((a, z) => a[bc] - z[bc]);
    const total = b.reduce((s, p) => s + p[3], 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += b[i][3]; if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, t = 0;
    for (const p of b) { r += p[0] * p[3]; g += p[1] * p[3]; bl += p[2] * p[3]; t += p[3]; }
    return [Math.round(r / t), Math.round(g / t), Math.round(bl / t)];
  });
}

/** Monta a paleta a partir de vários quadros RGBA (até 255 cores + transparente). */
export function buildPalette(frames, maxColors = 255) {
  const hist = new Map();
  for (const f of frames) {
    const b = f.data;
    // amostra no máximo ~200 mil pixels por quadro
    const step = Math.max(1, Math.floor(b.length / 4 / 200000)) * 4;
    for (let i = 0; i < b.length; i += step) {
      if (b[i + 3] < 128) continue;
      const k = ((b[i] >> 3) << 10) | ((b[i + 1] >> 3) << 5) | (b[i + 2] >> 3);
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  }
  const samples = [...hist].map(([k, n]) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4, n]);
  if (!samples.length) return [[0, 0, 0]];
  if (samples.length <= maxColors) return samples.map((s) => [s[0], s[1], s[2]]);
  return medianCut(samples, maxColors);
}

/** Tabela 32×32×32 → índice de cor mais próxima. */
function buildLut(palette) {
  const lut = new Uint8Array(32768);
  for (let k = 0; k < 32768; k++) {
    const r = ((k >> 10) & 31) * 8 + 4, g = ((k >> 5) & 31) * 8 + 4, b = (k & 31) * 8 + 4;
    let best = 0, bd = Infinity;
    for (let j = 0; j < palette.length; j++) {
      const c = palette[j], dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bd) { bd = d; best = j; }
    }
    lut[k] = best;
  }
  return lut;
}

/** Converte um quadro RGBA em índices (0 = transparente). */
export function indexFrame(rgba, w, h, palette, lut, dither) {
  const n = w * h, out = new Uint8Array(n);
  if (!dither) {
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      out[p] = rgba[i + 3] < 128 ? 0 : lut[((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)] + 1;
    }
    return out;
  }
  const err = new Float32Array((w + 2) * 3 * 2);
  for (let y = 0; y < h; y++) {
    const cur = (y & 1) * (w + 2) * 3, nxt = ((y + 1) & 1) * (w + 2) * 3;
    err.fill(0, nxt, nxt + (w + 2) * 3);
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      if (rgba[i + 3] < 128) { out[p] = 0; continue; }
      const e = cur + (x + 1) * 3;
      const r = Math.max(0, Math.min(255, rgba[i] + err[e]));
      const g = Math.max(0, Math.min(255, rgba[i + 1] + err[e + 1]));
      const b = Math.max(0, Math.min(255, rgba[i + 2] + err[e + 2]));
      const idx = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
      out[p] = idx + 1;
      const c = palette[idx];
      const er = r - c[0], eg = g - c[1], eb = b - c[2];
      const spread = (o, k) => { err[o] += er * k; err[o + 1] += eg * k; err[o + 2] += eb * k; };
      spread(e + 3, 7 / 16);
      spread(nxt + x * 3, 3 / 16);
      spread(nxt + (x + 1) * 3, 5 / 16);
      spread(nxt + (x + 2) * 3, 1 / 16);
    }
  }
  return out;
}

export function lzwEncode(index, minCode) {
  const out = [];
  let cur = 0, shift = 0;
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let table = new Map();
  const emit = (c) => { cur |= c << shift; shift += size; while (shift >= 8) { out.push(cur & 255); cur >>>= 8; shift -= 8; } };
  emit(clear);
  let ib = index[0];
  for (let i = 1; i < index.length; i++) {
    const k = index[i], key = (ib << 8) | k, code = table.get(key);
    if (code === undefined) {
      emit(ib);
      if (next === 4096) { emit(clear); next = eoi + 1; size = minCode + 1; table = new Map(); }
      else { if (next >= 1 << size) size++; table.set(key, next++); }
      ib = k;
    } else ib = code;
  }
  emit(ib); emit(eoi);
  if (shift > 0) out.push(cur & 255);
  return new Uint8Array(out);
}

/**
 * Codifica o GIF. Chama `onProgress(0..1)` e cede o controle entre quadros.
 * @param {Array<{data: Uint8ClampedArray, delay: number}>} frames  delay em ms
 * @param {number} w @param {number} h
 * @param {{dither?: boolean, loop?: boolean, onProgress?: (t:number)=>void}} [o]
 * @returns {Promise<Uint8Array>}
 */
export async function encodeGif(frames, w, h, { dither = true, loop = true, onProgress = () => {} } = {}) {
  const palette = buildPalette(frames);
  const lut = buildLut(palette);
  let bits = 1;
  while ((1 << bits) < palette.length + 1) bits++;
  const palSize = 1 << bits, minCode = Math.max(2, bits);
  const chunks = [];
  const head = [];
  const wb = (...b) => { for (const v of b) head.push(v & 255); };
  const w16 = (v) => wb(v, v >> 8);
  for (const ch of 'GIF89a') head.push(ch.charCodeAt(0));
  w16(w); w16(h);
  wb(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
  wb(0, 0, 0);
  for (let j = 1; j < palSize; j++) { const c = palette[j - 1] || [0, 0, 0]; wb(c[0], c[1], c[2]); }
  if (loop) { wb(0x21, 0xff, 11); for (const ch of 'NETSCAPE2.0') head.push(ch.charCodeAt(0)); wb(3, 1, 0, 0, 0); }
  chunks.push(new Uint8Array(head));
  for (let f = 0; f < frames.length; f++) {
    const fr = frames[f];
    const ind = indexFrame(fr.data, w, h, palette, lut, dither);
    const hdr = [];
    const hb = (...b) => { for (const v of b) hdr.push(v & 255); };
    const delay = Math.max(2, Math.round(fr.delay / 10));
    hb(0x21, 0xf9, 4, (2 << 2) | 1, delay, delay >> 8, 0, 0);
    hb(0x2c, 0, 0, 0, 0, w, w >> 8, h, h >> 8, 0);
    hb(minCode);
    chunks.push(new Uint8Array(hdr));
    const data = lzwEncode(ind, minCode);
    const sub = new Uint8Array(data.length + Math.ceil(data.length / 255) + 1);
    let o = 0;
    for (let i = 0; i < data.length; i += 255) {
      const part = data.subarray(i, i + 255);
      sub[o++] = part.length;
      sub.set(part, o); o += part.length;
    }
    sub[o++] = 0;
    chunks.push(sub.subarray(0, o));
    onProgress((f + 1) / frames.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  chunks.push(new Uint8Array([0x3b]));
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
