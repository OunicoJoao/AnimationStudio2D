import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mat, Rect, clamp, normDeg, snapAngle, transformedBounds } from '../src/core/math.js';

test('clamp e normDeg', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(normDeg(370), 10);
  assert.equal(normDeg(-190), 170);
});

test('matriz inversa desfaz a transformação', () => {
  const m = Mat.chain(Mat.translate(10, -4), Mat.rotate(0.7), Mat.scale(2, 3));
  const [x, y] = Mat.apply(m, 5, 6);
  const [bx, by] = Mat.apply(Mat.invert(m), x, y);
  assert.ok(Math.abs(bx - 5) < 1e-9 && Math.abs(by - 6) < 1e-9);
});

test('Rect união, interseção e limites', () => {
  assert.deepEqual(Rect.union({ x: 0, y: 0, w: 2, h: 2 }, { x: 3, y: 1, w: 1, h: 4 }), { x: 0, y: 0, w: 4, h: 5 });
  assert.deepEqual(Rect.intersect({ x: 0, y: 0, w: 4, h: 4 }, { x: 2, y: 2, w: 4, h: 4 }), { x: 2, y: 2, w: 2, h: 2 });
  assert.ok(Rect.isEmpty(Rect.intersect({ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 })));
  assert.deepEqual(Rect.clampTo({ x: -2.5, y: 1.2, w: 10, h: 3 }, 6, 6), { x: 0, y: 1, w: 6, h: 4 });
});

test('snapAngle prende em 45°', () => {
  const [x, y] = snapAngle(0, 0, 10, 9);
  assert.ok(Math.abs(x - y) < 1e-9);
});

test('transformedBounds de rotação de 90°', () => {
  const b = transformedBounds(Mat.rotate(Math.PI / 2), { x: 0, y: 0, w: 4, h: 2 });
  assert.ok(Math.abs(b.w - 2) < 1e-9 && Math.abs(b.h - 4) < 1e-9);
});
