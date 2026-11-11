import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Project, Layer } from '../src/model/Project.js';
import { Workspace } from '../src/app/Workspace.js';
import { FrameOps } from '../src/app/ops/FrameOps.js';
import { LayerOps } from '../src/app/ops/LayerOps.js';

/** Canvas falso: o modelo só guarda referências. */
const factory = { create: (w, h) => ({ width: w, height: h, fake: true }) };
const toast = () => {};

function setup(frames = 4) {
  const ws = new Workspace();
  const p = Project.create({ name: 't', width: 10, height: 10 }, factory);
  ws.setProject(p);
  const fo = new FrameOps(ws, toast);
  for (let i = 1; i < frames; i++) fo.addBlank();
  ws.history.clear();
  return { ws, p, fo, lo: new LayerOps(ws, toast) };
}

test('projeto novo tem uma camada e um quadro; duração considera hold', () => {
  const p = Project.create({ name: 'x', width: 4, height: 4, fps: 10 }, factory);
  assert.equal(p.layers.length, 1);
  assert.equal(p.frames.length, 1);
  p.frames[0].hold = 3;
  assert.equal(p.totalDurationMs(), 300);
  const json = p.toJSON();
  assert.equal(json.format, 'animationstudio2d');
  const again = new Project(json, factory);
  assert.equal(again.frames[0].hold, 3);
});

test('células: criar, trocar versão e remover', () => {
  const p = Project.create({ name: 'x', width: 4, height: 4 }, factory);
  const [l, f] = [p.layers[0].id, p.frames[0].id];
  const c = p.ensureCel(l, f);
  assert.equal(p.getCel(l, f), c);
  const v = p.versionOf(f);
  p.touch(l, f);
  assert.equal(p.versionOf(f), v + 1);
  p.setCel(l, f, null);
  assert.equal(p.getCel(l, f), null);
});

test('quadros: excluir, mover e desfazer mantêm ordem e trechos', () => {
  const { ws, p, fo } = setup(5);
  const ids = p.frames.map((f) => f.id);
  fo.addTag({ name: 'a', from: 1, to: 3 });
  ws.setFrameIndex(0);
  fo.remove();
  assert.equal(p.frames.length, 4);
  assert.deepEqual([p.tags[0].from, p.tags[0].to], [0, 2]);
  ws.history.undo();
  assert.deepEqual(p.frames.map((f) => f.id), ids);
  assert.deepEqual([p.tags[0].from, p.tags[0].to], [1, 3]);
  ws.setFrameIndex(0);
  fo.moveTo(3);
  assert.equal(p.frames[3].id, ids[0]);
  ws.history.undo();
  assert.deepEqual(p.frames.map((f) => f.id), ids);
});

test('quadros: inverter, duração e fps com desfazer', () => {
  const { ws, p, fo } = setup(3);
  const ids = p.frames.map((f) => f.id);
  ws.setFrameIndex(0);
  fo.reverse();
  assert.deepEqual(p.frames.map((f) => f.id), [...ids].reverse());
  fo.setHold(3);
  fo.setFps(24);
  assert.equal(p.fps, 24);
  ws.history.undo(); ws.history.undo(); ws.history.undo();
  assert.deepEqual(p.frames.map((f) => f.id), ids);
  assert.equal(p.fps, 12);
  assert.ok(p.frames.every((f) => f.hold === 1));
});

test('não exclui o último quadro nem a última camada', () => {
  const { ws, p, fo, lo } = setup(1);
  fo.remove();
  lo.remove();
  assert.equal(p.frames.length, 1);
  assert.equal(p.layers.length, 1);
  assert.equal(ws.history.canUndo, false);
});

test('camadas: adicionar, reordenar, propriedades e desfazer', () => {
  const { ws, p, lo } = setup(1);
  lo.add();
  lo.add();
  assert.equal(p.layers.length, 3);
  const top = ws.layerId;
  assert.equal(p.layers[2].id, top);
  lo.moveTo(2, 0);
  assert.equal(p.layers[0].id, top);
  lo.setProp(top, 'opacity', 0.5);
  lo.setProp(top, 'blend', 'multiply');
  assert.equal(p.layerById(top).blend, 'multiply');
  ws.history.undo(); ws.history.undo(); ws.history.undo();
  assert.equal(p.layers[2].id, top);
  assert.equal(p.layerById(top).opacity, 1);
  lo.remove();
  assert.equal(p.layers.length, 2);
  ws.history.undo();
  assert.ok(p.layerById(top));
  assert.ok(new Layer().id.startsWith('L'));
});
