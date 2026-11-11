import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floodMask, dilateMask, maskBounds, alphaBounds, maskOutline } from '../src/raster/flood.js';
import { invert, blur, brightnessContrast } from '../src/raster/filters.js';

/** imagem 5×5 transparente com uma "parede" vertical opaca na coluna 2 */
function wall() {
  const w = 5, h = 5, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) { const i = (y * w + 2) * 4; px[i] = 0; px[i + 3] = 255; }
  return { px, w, h };
}

test('flood respeita a parede', () => {
  const { px, w, h } = wall();
  const m = floodMask(px, w, h, 0, 0);
  assert.equal(m.reduce((s, v) => s + v, 0), 10);
  assert.deepEqual(maskBounds(m, w, h), { x: 0, y: 0, w: 2, h: 5 });
});

test('flood não contíguo pega os dois lados', () => {
  const { px, w, h } = wall();
  const m = floodMask(px, w, h, 0, 0, { contiguous: false });
  assert.equal(m.reduce((s, v) => s + v, 0), 20);
});

test('flood fora da imagem devolve máscara vazia', () => {
  const { px, w, h } = wall();
  assert.equal(floodMask(px, w, h, -1, 3).reduce((s, v) => s + v, 0), 0);
});

test('dilatar cresce a região', () => {
  const w = 7, h = 7, m = new Uint8Array(w * h);
  m[3 * w + 3] = 1;
  const d1 = dilateMask(m, w, h, 1);
  assert.equal(d1.reduce((s, v) => s + v, 0), 5);
  const d2 = dilateMask(m, w, h, 2);
  assert.ok(d2.reduce((s, v) => s + v, 0) > 9);
});

test('limites de alfa e contorno', () => {
  const { px, w, h } = wall();
  assert.deepEqual(alphaBounds(px, w, h), { x: 2, y: 0, w: 1, h: 5 });
  const segs = maskOutline(w, h, (p) => p % w === 2);
  // retângulo 1×5 → 4 segmentos (topo, base, esquerda, direita)
  assert.equal(segs.length / 4, 4);
});

test('filtros: inverter, brilho e desfoque preservam transparência', () => {
  const src = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 0]);
  const out = new Uint8ClampedArray(8);
  invert(src, out, null);
  assert.deepEqual([...out], [245, 235, 225, 255, 0, 0, 0, 0]);
  brightnessContrast(src, out, null, { brightness: 100, contrast: 0 });
  assert.equal(out[0], 255);
  const big = new Uint8ClampedArray(16 * 4);
  big[8 * 4 + 3] = 255; big[8 * 4] = 200;
  const b = new Uint8ClampedArray(big.length);
  blur(big, b, null, { radius: 3, width: 16, height: 1 });
  assert.ok(b[7 * 4 + 3] > 0 && b[8 * 4 + 3] < 255);
  assert.ok(Math.abs(b[7 * 4] - 200) <= 1); // cor sem halo escuro
});
