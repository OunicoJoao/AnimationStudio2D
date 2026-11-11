import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Viewport } from '../src/render/Viewport.js';

test('tela ↔ documento com zoom, rotação e espelho', () => {
  const v = new Viewport();
  v.setDocSize(200, 100); v.setScreenSize(800, 600); v.fit();
  v.rotateAt(30, 100, 100); v.setFlip(true); v.zoomAt(3, 400, 300);
  const s = v.toScreen(17, 42);
  const d = v.toDoc(s.x, s.y);
  assert.ok(Math.abs(d.x - 17) < 1e-6 && Math.abs(d.y - 42) < 1e-6);
});

test('zoomAt mantém o ponto sob o cursor', () => {
  const v = new Viewport();
  v.setDocSize(100, 100); v.setScreenSize(500, 500); v.fit();
  const before = v.toDoc(120, 80);
  v.zoomAt(5, 120, 80);
  const after = v.toDoc(120, 80);
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6);
});

test('pinça: dedos que se afastam dão zoom', () => {
  const v = new Viewport();
  v.setDocSize(100, 100); v.setScreenSize(500, 500); v.fit();
  const start = v.snapshot();
  v.pinch(start, { x: 200, y: 250 }, { x: 300, y: 250 }, { x: 150, y: 250 }, { x: 350, y: 250 });
  assert.ok(Math.abs(v.zoom - start.zoom * 2) < 1e-9);
  assert.equal(v.rotation, 0);
});
