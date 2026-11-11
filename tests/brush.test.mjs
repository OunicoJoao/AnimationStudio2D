import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrokeSampler } from '../src/brush/StrokeSampler.js';
import { Stabilizer } from '../src/brush/Stabilizer.js';
import { symmetryMatrices } from '../src/brush/Symmetry.js';
import { Mat } from '../src/core/math.js';

test('carimbos igualmente espaçados numa reta', () => {
  const s = new StrokeSampler(() => 2);
  const dabs = [...s.begin({ x: 0, y: 0, p: 1 })];
  for (let x = 5; x <= 40; x += 5) dabs.push(...s.add({ x, y: 0, p: 1 }));
  dabs.push(...s.end());
  for (let i = 1; i < dabs.length; i++) {
    const d = dabs[i].x - dabs[i - 1].x;
    assert.ok(Math.abs(d - 2) < 0.05, `espaçamento ${d}`);
  }
  assert.ok(dabs.at(-1).x > 38);
});

test('estabilizador reduz o tremor e termina no ponto real', () => {
  const st = new Stabilizer(0.8);
  st.begin({ x: 0, y: 0, p: 1 });
  let maxDev = 0;
  for (let i = 1; i <= 60; i++) {
    const p = st.push({ x: i * 2, y: i % 2 ? 3 : -3, p: 1 });
    if (p) maxDev = Math.max(maxDev, Math.abs(p.y));
  }
  assert.ok(maxDev < 2, `desvio ${maxDev}`);
  const tail = st.finish();
  assert.equal(tail.at(-1).x, 120);
});

test('simetria radial gera N cópias em volta do centro', () => {
  const ms = symmetryMatrices({ mode: 'radial', count: 4 }, 50, 50);
  assert.equal(ms.length, 4);
  const [x, y] = Mat.apply(ms[1], 60, 50);
  assert.ok(Math.abs(x - 50) < 1e-9 && Math.abs(y - 60) < 1e-9);
  const mv = symmetryMatrices({ mode: 'vertical' }, 50, 50);
  assert.deepEqual(Mat.apply(mv[1], 10, 7), [90, 7]);
});
